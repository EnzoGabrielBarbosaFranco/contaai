import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const browserPaths = [
  ["Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"],
  ["Edge", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]
];
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function availablePort() {
  const probe = createNetServer();
  await new Promise((resolveListen, reject) => probe.once("error", reject).listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise(resolveClose => probe.close(resolveClose));
  return port;
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const requestedFile = pathname === "/" ? "/index.html" : pathname;
      const filePath = resolve(projectRoot, `.${requestedFile}`);
      if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentTypes[extname(filePath)] || "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return server;
}

async function retry(task, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await task(); }
    catch (error) { lastError = error; await new Promise(resolveWait => setTimeout(resolveWait, 100)); }
  }
  throw lastError || new Error("Tempo de espera excedido");
}

async function connectDevTools(url) {
  const targets = await retry(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`DevTools respondeu ${response.status}`);
    return response.json();
  });
  const page = targets.find(target => target.type === "page");
  assert(page, "A aba do teste não foi encontrada");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    if (!message.id || !pending.has(message.id)) return;
    const { resolveCommand, rejectCommand } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectCommand(new Error(message.error.message));
    else resolveCommand(message.result);
  });

  function command(method, params = {}) {
    const id = ++commandId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand }));
  }

  async function evaluate(expression) {
    const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }

  await command("Runtime.enable");
  await retry(async () => {
    const ready = await evaluate("document.readyState === 'complete' && Boolean(document.querySelector('#transactionForm'))");
    if (!ready) throw new Error("Página ainda não carregou");
  });

  return { command, evaluate, exceptions, close: () => socket.close() };
}

const fillAndSubmit = (type, title, amount) => `(async () => {
  document.querySelector('[data-open-transaction="${type}"]').click();
  const form = document.querySelector('#transactionForm');
  form.elements.title.value = ${JSON.stringify(title)};
  form.elements.amount.value = ${JSON.stringify(amount)};
  form.elements.amount.dispatchEvent(new Event('input', { bubbles: true }));
  form.elements.account.value = 'Conta teste';
  form.requestSubmit();
  await new Promise(resolve => setTimeout(resolve, 50));
  return {
    modalClosed: document.querySelector('#transactionModal').classList.contains('hidden'),
    amountError: form.elements.amount.validationMessage,
    saved: JSON.parse(localStorage.getItem('contaai-transactions-v2') || '[]'),
    toast: document.querySelector('#toast').textContent
  };
})()`;

async function runBrowser(name, executable, appUrl) {
  const debugPort = await availablePort();
  const profile = await mkdtemp(resolve(tmpdir(), "contaai-browser-test-"));
  const browser = spawn(executable, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "--lang=pt-BR",
    appUrl
  ], { stdio: "ignore" });

  let devTools;
  try {
    devTools = await connectDevTools(`http://127.0.0.1:${debugPort}/json/list`);
    await devTools.command("Emulation.setDeviceMetricsOverride", { width: 1354, height: 650, deviceScaleFactor: 1, mobile: false });
    await devTools.evaluate("localStorage.clear(); location.reload(); true").catch(() => {});
    await retry(async () => {
      const ready = await devTools.evaluate("document.readyState === 'complete' && Boolean(document.querySelector('#transactionForm'))");
      if (!ready) throw new Error("Página ainda não recarregou");
    });

    const formatting = await devTools.evaluate(`(() => {
      document.querySelector('[data-open-transaction="income"]').click();
      const amount = document.querySelector('#transactionForm').elements.amount;
      amount.focus();
      amount.value = '2000';
      amount.dispatchEvent(new Event('input', { bubbles: true }));
      const whileTyping = amount.value;
      amount.value = '2.00';
      amount.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      const afterDeletingDigit = amount.value;
      amount.value = '2000';
      amount.dispatchEvent(new Event('input', { bubbles: true }));
      amount.blur();
      const afterBlur = amount.value;
      document.querySelector('#transactionModal .close-modal').click();
      return { whileTyping, afterDeletingDigit, afterBlur };
    })()`);
    assert(formatting.whileTyping === "2.000" && formatting.afterDeletingDigit === "200" && formatting.afterBlur === "2.000,00", `${name}: a formatação automática do valor falhou`);

    const darkMode = await devTools.evaluate(`(() => {
      document.querySelector('#themeBtn').click();
      document.querySelector('[data-open-transaction="income"]').click();
      const footer = document.querySelector('.sidebar-foot').getBoundingClientRect();
      const modal = getComputedStyle(document.querySelector('#transactionModal .modal'));
      const activeTab = getComputedStyle(document.querySelector('.period-tabs button.active'));
      const result = {
        bodyDark: document.body.classList.contains('dark'),
        appDark: document.querySelector('#app').classList.contains('dark'),
        modalBackground: modal.backgroundImage,
        modalColorScheme: modal.colorScheme,
        activeTabColor: activeTab.color,
        footerVisible: footer.top >= 0 && footer.bottom <= innerHeight + 1
      };
      document.querySelector('#transactionModal .close-modal').click();
      document.querySelector('#themeBtn').click();
      return result;
    })()`);
    assert(darkMode.bodyDark && darkMode.appDark && darkMode.modalBackground !== "none", `${name}: o dark mode não alcançou toda a interface`);
    assert(darkMode.modalColorScheme === "dark", `${name}: os controles nativos do modal não receberam o tema escuro`);
    assert(darkMode.footerVisible, `${name}: o rodapé lateral ficou cortado em 1354x650`);

    if (process.argv.includes("--screenshots") && name === "Chrome") {
      await devTools.evaluate("document.querySelector('#themeBtn').click(); new Promise(resolve => setTimeout(() => resolve(true), 350))");
      const dashboardShot = await devTools.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const dashboardPath = resolve(tmpdir(), "contaai-dark-dashboard.png");
      await writeFile(dashboardPath, Buffer.from(dashboardShot.data, "base64"));

      await devTools.evaluate(`(async () => {
        document.querySelector('[data-open-transaction="income"]').click();
        const amount = document.querySelector('#transactionForm').elements.amount;
        amount.value = '2000';
        amount.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
        return true;
      })()`);
      const modalShot = await devTools.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const modalPath = resolve(tmpdir(), "contaai-dark-modal.png");
      await writeFile(modalPath, Buffer.from(modalShot.data, "base64"));
      process.stdout.write(`Prévia: ${dashboardPath}\nPrévia: ${modalPath}\n`);
      await devTools.evaluate("document.querySelector('#transactionModal .close-modal').click(); document.querySelector('#themeBtn').click(); true");
    }

    const expense = await devTools.evaluate(fillAndSubmit("expense", "Despesa Chrome", "1.234,56"));
    assert(expense.modalClosed, `${name}: a despesa com vírgula não fechou o modal`);
    assert(expense.saved[0]?.amount === 1234.56 && expense.saved[0]?.type === "expense", `${name}: a despesa foi salva com valor incorreto`);

    const income = await devTools.evaluate(fillAndSubmit("income", "Entrada Chrome", "987.65"));
    assert(income.modalClosed, `${name}: a entrada com ponto não fechou o modal`);
    assert(income.saved[0]?.amount === 987.65 && income.saved[0]?.type === "income", `${name}: a entrada foi salva com valor incorreto`);

    const invalid = await devTools.evaluate(fillAndSubmit("expense", "Valor inválido", "abc"));
    assert(!invalid.modalClosed && invalid.saved.length === 2 && invalid.amountError, `${name}: um valor inválido foi aceito`);
    await devTools.evaluate("document.querySelector('#transactionModal .close-modal').click(); true");

    const blockedStorage = await devTools.evaluate(`(async () => {
      window.__originalStorageSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'SecurityError'); };
      ${fillAndSubmit("expense", "Sessão sem storage", "10,50")}
      const visibleRows = document.querySelector('#recentTransactions').textContent;
      Storage.prototype.setItem = window.__originalStorageSetItem;
      return { visibleRows, modalClosed: document.querySelector('#transactionModal').classList.contains('hidden'), toast: document.querySelector('#toast').textContent };
    })()`);
    assert(blockedStorage.modalClosed && blockedStorage.visibleRows.includes("Sessão sem storage"), `${name}: o cadastro travou com armazenamento bloqueado`);
    assert(blockedStorage.toast.includes("nesta sessão"), `${name}: não houve aviso sobre o armazenamento bloqueado`);

    await devTools.evaluate(`
      localStorage.setItem('contaai-transactions-v2', JSON.stringify({ antigo: true }));
      localStorage.setItem('contaai-goals-v2', 'null');
      localStorage.setItem('contaai-categories-v1', JSON.stringify({ inválido: true }));
      localStorage.setItem('contaai-ui-state-v1', 'null');
      location.reload();
      true
    `).catch(() => {});
    await retry(async () => {
      const recovered = await devTools.evaluate("document.readyState === 'complete' && document.querySelector('#recentTransactions')?.textContent.includes('Nenhum lançamento')");
      if (!recovered) throw new Error("Aplicação ainda não se recuperou dos dados antigos");
    });

    assert(devTools.exceptions.length === 0, `${name}: erros de JavaScript: ${devTools.exceptions.join(", ")}`);
    process.stdout.write(`✓ ${name}: despesas, entradas, formatos monetários e armazenamento validados\n`);
  } finally {
    devTools?.close();
    const taskkill = spawn("taskkill", ["/pid", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
    await new Promise(resolveExit => taskkill.once("exit", resolveExit));
    await retry(() => rm(profile, { recursive: true, force: true }), 5000);
  }
}

const server = startStaticServer();
await new Promise((resolveListen, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();

try {
  for (const [name, executable] of browserPaths) await runBrowser(name, executable, `http://127.0.0.1:${port}/index.html`);
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}
