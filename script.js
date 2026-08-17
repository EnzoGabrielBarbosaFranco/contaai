(() => {
  "use strict";

  const STORAGE_KEY = "contaai-transactions-v2";
  const GOALS_KEY = "contaai-goals-v2";
  const THEME_KEY = "meu-dinheiro-static-theme";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const shortMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  const categories = ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Assinaturas", "Compras", "Salário", "Freelance", "Investimentos", "Outros"];
  const colors = { Moradia: "#6962c7", Alimentação: "#d58a48", Transporte: "#3b8f83", Lazer: "#d06f68", Saúde: "#c75d7a", Educação: "#4f7fa8", Assinaturas: "#8b67ad", Compras: "#b86f91", Salário: "#348564", Freelance: "#438ab4", Investimentos: "#3a948b", Outros: "#87928d" };
  const icon = (name, className = "") => `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const icons = { balance: icon("wallet"), income: icon("arrow-up-right"), expense: icon("arrow-down-right"), savings: icon("piggy-bank") };

  const pad = value => String(value).padStart(2, "0");
  const toISO = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = value => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const escapeHTML = value => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  const state = {
    transactions: load(STORAGE_KEY, []),
    goals: load(GOALS_KEY, []),
    period: "month",
    anchor: new Date(),
    search: "",
    view: "dashboard",
    transactionType: "expense"
  };

  function load(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals));
  }
  function inPeriod(date, period, anchor) {
    if (period === "day") return date.toDateString() === anchor.toDateString();
    if (period === "week") {
      const start = new Date(anchor); start.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(start.getDate() + 7);
      return date >= start && date < end;
    }
    if (period === "month") return date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear();
    return date.getFullYear() === anchor.getFullYear();
  }
  function filteredTransactions() {
    const search = state.search.toLocaleLowerCase("pt-BR");
    return state.transactions.filter(item => inPeriod(parseDate(item.date), state.period, state.anchor))
      .filter(item => !search || `${item.title} ${item.category} ${item.account}`.toLocaleLowerCase("pt-BR").includes(search))
      .sort((a, b) => b.date.localeCompare(a.date));
  }
  function totals(items) {
    const income = items.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
    const expenses = items.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    return { income, expenses, balance: income - expenses, savings: income ? Math.max(0, Math.round((income - expenses) / income * 100)) : 0 };
  }
  function groups(items) {
    const grouped = {};
    items.filter(item => item.type === "expense").forEach(item => grouped[item.category] = (grouped[item.category] || 0) + Number(item.amount));
    return Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  }

  function render() {
    const items = filteredTransactions();
    const total = totals(items);
    renderPeriodLabel();
    renderTabs();
    renderSummary(total, items);
    renderMonthlyChart();
    renderCategoryChart(groups(items), total.expenses);
    renderTransactions(items);
    renderInsights(groups(items), total);
    renderRecurring();
    renderGoals();
  }

  function renderPeriodLabel() {
    const options = state.period === "day" ? { day: "2-digit", month: "long", year: "numeric" } : state.period === "month" ? { month: "long", year: "numeric" } : null;
    let label;
    if (state.period === "week") label = `Semana de ${state.anchor.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
    else if (state.period === "year") label = String(state.anchor.getFullYear());
    else label = state.anchor.toLocaleDateString("pt-BR", options);
    document.querySelector("#periodLabel").textContent = label;
  }
  function renderTabs() {
    const labels = { day: "Dia", week: "Semana", month: "Mês", year: "Ano" };
    const html = Object.entries(labels).map(([key, label]) => `<button class="${state.period === key ? "active" : ""}" data-period="${key}">${label}</button>`).join("");
    document.querySelectorAll(".period-tabs-slot").forEach(slot => slot.innerHTML = html);
  }
  function renderSummary(total, items) {
    const incomeCount = items.filter(item => item.type === "income").length;
    const expenseCount = items.filter(item => item.type === "expense").length;
    const cards = [
      ["Saldo do período", total.balance, "balance", items.length ? (total.balance >= 0 ? "Entradas menos despesas" : "Despesas acima das entradas") : "Sem movimentações"],
      ["Entradas", total.income, "income", incomeCount ? `${incomeCount} ${incomeCount === 1 ? "recebimento" : "recebimentos"}` : "Nenhuma entrada"],
      ["Despesas", total.expenses, "expense", expenseCount ? `${expenseCount} ${expenseCount === 1 ? "pagamento" : "pagamentos"}` : "Nenhuma despesa"],
      ["Taxa de economia", total.income ? total.savings : null, "savings", total.income ? "Percentual da renda preservado" : "Disponível após registrar renda"]
    ];
    const html = cards.map(([label, value, tone, detail]) => `<article class="summary-card ${tone}"><div class="summary-icon">${icons[tone]}</div><div class="summary-copy"><span>${label}</span><strong>${tone === "savings" ? (value === null ? "—" : `${value}%`) : money.format(value)}</strong><small>${detail}</small></div></article>`).join("");
    document.querySelectorAll(".summary-slot").forEach(slot => slot.innerHTML = html);
  }
  function renderMonthlyChart() {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(state.anchor.getFullYear(), state.anchor.getMonth() - 5 + index, 1);
      const monthItems = state.transactions.filter(item => item.date.startsWith(monthKey(date)));
      const total = totals(monthItems);
      return { label: date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), income: total.income, expense: total.expenses };
    });
    const target = document.querySelector("#monthlyChart");
    if (!months.some(month => month.income || month.expense)) {
      target.innerHTML = empty("O histórico aparecerá aqui", "Adicione entradas e despesas para acompanhar a evolução mensal.");
      return;
    }
    const width = 720, height = 236, left = 62, right = 18, top = 18, bottom = 38;
    const rawMaximum = Math.max(...months.flatMap(month => [month.income, month.expense]), 1);
    const magnitude = 10 ** Math.floor(Math.log10(rawMaximum));
    const maximum = Math.ceil(rawMaximum / magnitude) * magnitude;
    const chartWidth = width - left - right, chartHeight = height - top - bottom;
    const points = type => months.map((month, index) => ({ x: left + chartWidth * index / (months.length - 1), y: top + chartHeight * (1 - month[type] / maximum), value: month[type] }));
    const path = values => values.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
    const incomePoints = points("income"), expensePoints = points("expense");
    const area = `${path(incomePoints)} L${incomePoints.at(-1).x},${height - bottom} L${incomePoints[0].x},${height - bottom} Z`;
    const ticks = [1, .75, .5, .25, 0];
    target.innerHTML = `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparação de entradas e despesas dos últimos seis meses"><defs><linearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7665" stop-opacity=".2"/><stop offset="1" stop-color="#4f7665" stop-opacity="0"/></linearGradient></defs>${ticks.map(tick => { const y = top + chartHeight * (1 - tick); return `<line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text class="axis-label" x="${left - 12}" y="${y + 3}" text-anchor="end">${shortMoney.format(maximum * tick)}</text>`; }).join("")}<path class="chart-area-fill" d="${area}"/><path class="chart-line expense-line" d="${path(expensePoints)}"/><path class="chart-line income-line" d="${path(incomePoints)}"/>${incomePoints.map((point, index) => `<g><circle class="chart-point income-point" cx="${point.x}" cy="${point.y}" r="4"><title>Entradas em ${months[index].label}: ${money.format(point.value)}</title></circle><text class="month-label" x="${point.x}" y="${height - 12}" text-anchor="middle">${months[index].label}</text></g>`).join("")}${expensePoints.map((point, index) => `<circle class="chart-point expense-point" cx="${point.x}" cy="${point.y}" r="4"><title>Despesas em ${months[index].label}: ${money.format(point.value)}</title></circle>`).join("")}</svg>`;
  }
  function renderCategoryChart(categoryGroups, total) {
    const target = document.querySelector("#categoryChart");
    if (!categoryGroups.length) { target.innerHTML = empty("Sem despesas no período", "As categorias serão exibidas depois do primeiro lançamento."); return; }
    const visibleGroups = categoryGroups.length > 5
      ? [...categoryGroups.slice(0, 4), ["Outras", categoryGroups.slice(4).reduce((sum, [, value]) => sum + value, 0)]]
      : categoryGroups;
    const circumference = 301.59;
    let offset = 0;
    const segments = visibleGroups.map(([category, value]) => { const length = value / total * circumference; const segment = `<circle class="donut-segment" cx="58" cy="58" r="48" fill="none" stroke="${colors[category] || colors.Outros}" stroke-width="12" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"/>`; offset += length; return segment; }).join("");
    target.innerHTML = `<div class="category-content"><div class="donut-wrap"><svg class="donut" viewBox="0 0 116 116" role="img" aria-label="Distribuição das despesas por categoria"><circle class="donut-track" cx="58" cy="58" r="48" fill="none" stroke-width="12"/>${segments}</svg><div class="donut-total"><span>Total</span><strong>${shortMoney.format(total)}</strong></div></div><div class="category-list">${visibleGroups.map(([category, value]) => `<div><span><i style="background:${colors[category] || colors.Outros}"></i>${escapeHTML(category)}</span><strong>${Math.round(value / total * 100)}%</strong><small>${money.format(value)}</small></div>`).join("")}</div></div>`;
  }
  function transactionRow(item) {
    const sign = item.type === "income" ? "+" : "−";
    return `<div class="transaction-row"><div class="transaction-symbol" style="background:${colors[item.category] || colors.Outros}18;color:${colors[item.category] || colors.Outros}">${icon(item.type === "income" ? "arrow-up-right" : "arrow-down-right")}</div><div class="transaction-main"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.category)} · ${escapeHTML(item.account)}</span></div><time>${parseDate(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</time><strong class="amount ${item.type === "income" ? "income-text" : "expense-text"}">${sign}${money.format(item.amount)}</strong><button class="delete-button" data-delete="${item.id}" aria-label="Excluir lançamento">${icon("trash")}</button></div>`;
  }
  function renderTransactions(items) {
    document.querySelector("#recentTransactions").innerHTML = items.length ? items.slice(0, 6).map(transactionRow).join("") : empty("Nenhum lançamento encontrado.");
    document.querySelector("#transactionCount").textContent = `${items.length} lançamentos`;
    document.querySelector("#allTransactions").innerHTML = items.length ? `<div class="table-head"><span>Lançamento</span><span>Data</span><span>Categoria</span><span>Valor</span><span></span></div>${items.map(transactionRow).join("")}` : empty("Nenhum lançamento encontrado para este filtro.");
  }
  function renderInsights(categoryGroups, total) {
    const top = categoryGroups[0];
    const target = document.querySelector("#insightsPanel");
    if (!total.income && !total.expenses) {
      target.innerHTML = `<div class="insights-title"><span>${icon("chart")}</span><div><small>RESUMO DO PERÍODO</small><h2>Comece pelos lançamentos</h2></div></div><div class="insight-empty"><p>Quando você registrar suas movimentações, verá aqui um resumo direto do período — sem estimativas inventadas.</p><button class="insight-action" data-open-transaction="expense">${icon("plus")} Adicionar lançamento</button></div>`;
      return;
    }
    const balance = total.balance;
    const expenseShare = total.income ? Math.round(total.expenses / total.income * 100) : null;
    const transactionCount = filteredTransactions().length;
    target.innerHTML = `<div class="insights-title"><span>${icon("chart")}</span><div><small>RESUMO DO PERÍODO</small><h2>Leitura dos seus números</h2></div></div><div class="insight-highlight"><span>Resultado do período</span><strong class="${balance < 0 ? "negative" : ""}">${money.format(balance)}</strong><small>Entradas menos despesas</small></div><div class="insight-list"><div><span class="insight-number">01</span><p><strong>${top ? `Maior gasto: ${escapeHTML(top[0])}` : "Nenhuma despesa"}</strong>${top ? `${money.format(top[1])}, equivalente a ${Math.round(top[1] / total.expenses * 100)}% das despesas.` : "Não houve saídas registradas neste período."}</p></div><div><span class="insight-number">02</span><p><strong>${expenseShare === null ? "Sem renda registrada" : `${expenseShare}% da renda foi utilizada`}</strong>${expenseShare === null ? "Adicione suas entradas para comparar renda e despesas." : `${money.format(total.expenses)} em despesas sobre ${money.format(total.income)} em entradas.`}</p></div><div><span class="insight-number">03</span><p><strong>${transactionCount} ${transactionCount === 1 ? "movimentação" : "movimentações"}</strong>Total considerado no filtro e período selecionados.</p></div></div><button data-scroll-categories>Ver categorias ${icon("arrow-right")}</button>`;
  }
  function renderRecurring() {
    const items = state.transactions.filter(item => item.recurring && item.type === "expense");
    const committed = items.reduce((sum, item) => sum + Number(item.amount), 0);
    const paid = items.filter(item => item.paid).reduce((sum, item) => sum + Number(item.amount), 0);
    document.querySelector("#fixedCount").textContent = items.length;
    document.querySelector("#fixedSummary").innerHTML = `<div><span>Comprometido no mês</span><strong>${money.format(committed)}</strong></div><div><span>Já pago</span><strong>${money.format(paid)}</strong></div><div><span>Falta pagar</span><strong>${money.format(committed - paid)}</strong></div><div class="fixed-progress"><span style="width:${committed ? paid / committed * 100 : 0}%"></span></div>`;
    document.querySelector("#recurringGrid").innerHTML = items.length ? items.map(item => `<div class="recurring-card ${item.paid ? "paid" : ""}"><div class="recurring-top"><span class="category-icon" style="color:${colors[item.category]};background:${colors[item.category]}18">${icon("repeat")}</span><button data-delete="${item.id}" aria-label="Excluir">${icon("trash")}</button></div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.category)} · todo mês</small><b>${money.format(item.amount)}</b><label><input type="checkbox" data-toggle-paid="${item.id}" ${item.paid ? "checked" : ""}><span>${item.paid ? "Pago" : "Marcar como pago"}</span></label></div>`).join("") : empty("Nenhum gasto fixo cadastrado", "Cadastre uma despesa e marque-a como gasto fixo.");
  }
  function renderGoals() {
    const target = document.querySelector("#goalsGrid");
    target.innerHTML = state.goals.length ? state.goals.map(goal => { const percentage = Math.min(100, Math.round(goal.saved / goal.target * 100)); return `<article class="goal-card"><div class="goal-head"><span class="goal-icon" style="background:${goal.color}18;color:${goal.color}">${icon("target")}</span><button data-delete-goal="${goal.id}" aria-label="Excluir meta">${icon("trash")}</button></div><span class="goal-label">OBJETIVO</span><h2>${escapeHTML(goal.title)}</h2><div class="goal-values"><strong>${money.format(goal.saved)}</strong><span>de ${money.format(goal.target)}</span></div><div class="goal-progress"><span style="width:${percentage}%;background:${goal.color}"></span></div><div class="goal-foot"><b>${percentage}% concluído</b><small>Faltam ${money.format(Math.max(0, goal.target - goal.saved))}</small></div><form class="deposit-form" data-goal="${goal.id}"><input type="number" min="1" required placeholder="Valor do aporte"><button>Aportar</button></form></article>`; }).join("") : `<article class="panel full-panel">${empty("Crie sua primeira meta", "Defina um valor e acompanhe os aportes ao longo do tempo.")}</article>`;
  }
  function empty(text, detail = "Altere o período ou registre um novo lançamento.") { return `<div class="empty-state"><span>${icon("inbox")}</span><strong>${escapeHTML(text)}</strong><small>${escapeHTML(detail)}</small></div>`; }

  function switchView(view) {
    state.view = view;
    document.querySelectorAll(".view").forEach(section => section.classList.toggle("active", section.id === `${view}View`));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    document.querySelector("#sidebar").classList.remove("open");
    document.querySelector("#scrim").classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openTransaction(type) {
    state.transactionType = type;
    document.querySelector("#transactionModalTitle").textContent = type === "income" ? "Registrar entrada" : "Registrar despesa";
    document.querySelector("#fixedField").classList.toggle("hidden", type === "income");
    const allowed = type === "income" ? ["Salário", "Freelance", "Investimentos", "Outros"] : categories.filter(category => !["Salário", "Freelance"].includes(category));
    document.querySelector("#categorySelect").innerHTML = allowed.map(category => `<option>${category}</option>`).join("");
    const form = document.querySelector("#transactionForm"); form.reset(); form.elements.date.value = toISO(new Date());
    document.querySelector("#transactionModal").classList.remove("hidden");
    setTimeout(() => form.elements.title.focus(), 50);
  }
  function closeModals() { document.querySelectorAll(".modal-backdrop").forEach(modal => modal.classList.add("hidden")); }
  function toast(message) {
    const element = document.querySelector("#toast"); element.innerHTML = `<span>✓</span>${escapeHTML(message)}`; element.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.add("hidden"), 2800);
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }
  function exportCSV() {
    const rows = [["Data", "Tipo", "Descrição", "Categoria", "Conta", "Valor"], ...state.transactions.map(item => [item.date, item.type === "income" ? "Entrada" : "Despesa", item.title, item.category, item.account, Number(item.amount).toFixed(2)])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    download("\ufeff" + csv, `meu-dinheiro-${toISO(new Date())}.csv`, "text/csv;charset=utf-8"); toast("Planilha exportada");
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("button"); if (!button) return;
    if (button.dataset.view) switchView(button.dataset.view);
    if (button.dataset.goView) switchView(button.dataset.goView);
    if (button.dataset.openTransaction) openTransaction(button.dataset.openTransaction);
    if (button.dataset.period) { state.period = button.dataset.period; render(); }
    if (button.dataset.delete) { state.transactions = state.transactions.filter(item => item.id !== button.dataset.delete); save(); render(); toast("Lançamento excluído"); }
    if (button.dataset.deleteGoal) { state.goals = state.goals.filter(goal => goal.id !== button.dataset.deleteGoal); save(); render(); toast("Meta excluída"); }
    if (button.matches(".close-modal")) closeModals();
    if (button.matches(".export-btn")) exportCSV();
    if (button.hasAttribute("data-scroll-categories")) document.querySelector(".category-chart").scrollIntoView({ behavior: "smooth" });
  });
  document.addEventListener("change", event => {
    if (event.target.matches("[data-toggle-paid]")) { state.transactions = state.transactions.map(item => item.id === event.target.dataset.togglePaid ? { ...item, paid: event.target.checked } : item); save(); render(); }
  });
  document.querySelectorAll(".search-input").forEach(input => input.addEventListener("input", event => { state.search = event.target.value; document.querySelectorAll(".search-input").forEach(other => { if (other !== event.target) other.value = state.search; }); render(); }));
  document.querySelector("#transactionForm").addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const recurring = data.get("recurring") === "on";
    state.transactions.unshift({ id: uid(), title: data.get("title").trim(), amount: Number(data.get("amount")), type: state.transactionType, category: data.get("category"), date: data.get("date"), account: data.get("account"), note: data.get("note").trim(), recurring, paid: recurring ? false : true });
    save(); closeModals(); render(); toast(state.transactionType === "income" ? "Entrada registrada com sucesso" : "Despesa registrada com sucesso");
  });
  document.querySelector("#goalForm").addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); state.goals.push({ id: uid(), title: data.get("title").trim(), target: Number(data.get("target")), saved: Number(data.get("saved") || 0), color: "#5b5bd6" }); save(); closeModals(); event.currentTarget.reset(); render(); toast("Meta criada com sucesso");
  });
  document.querySelector("#goalsGrid").addEventListener("submit", event => {
    const form = event.target.closest(".deposit-form"); if (!form) return; event.preventDefault(); const amount = Number(form.querySelector("input").value); state.goals = state.goals.map(goal => goal.id === form.dataset.goal ? { ...goal, saved: Math.min(goal.target, goal.saved + amount) } : goal); save(); render(); toast("Aporte registrado");
  });
  document.querySelector("#prevPeriod").addEventListener("click", () => movePeriod(-1));
  document.querySelector("#nextPeriod").addEventListener("click", () => movePeriod(1));
  function movePeriod(direction) { if (state.period === "day") state.anchor.setDate(state.anchor.getDate() + direction); else if (state.period === "week") state.anchor.setDate(state.anchor.getDate() + direction * 7); else if (state.period === "month") state.anchor.setMonth(state.anchor.getMonth() + direction); else state.anchor.setFullYear(state.anchor.getFullYear() + direction); state.anchor = new Date(state.anchor); render(); }
  document.querySelector("#themeBtn").addEventListener("click", () => { document.querySelector("#app").classList.toggle("dark"); localStorage.setItem(THEME_KEY, document.querySelector("#app").classList.contains("dark") ? "dark" : "light"); });
  document.querySelector("#openMenu").addEventListener("click", () => { document.querySelector("#sidebar").classList.add("open"); document.querySelector("#scrim").classList.add("active"); });
  ["#closeMenu", "#scrim"].forEach(selector => document.querySelector(selector).addEventListener("click", () => { document.querySelector("#sidebar").classList.remove("open"); document.querySelector("#scrim").classList.remove("active"); }));
  document.querySelector("#openGoal").addEventListener("click", () => document.querySelector("#goalModal").classList.remove("hidden"));
  document.querySelectorAll(".modal-backdrop").forEach(modal => modal.addEventListener("mousedown", event => { if (event.target === modal) closeModals(); }));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
  document.querySelector("#backupBtn").addEventListener("click", () => { download(JSON.stringify({ transactions: state.transactions, goals: state.goals }, null, 2), `backup-meu-dinheiro-${toISO(new Date())}.json`, "application/json"); toast("Backup criado com sucesso"); });
  document.querySelector("#restoreBtn").addEventListener("click", () => document.querySelector("#restoreInput").click());
  document.querySelector("#restoreInput").addEventListener("change", event => {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); if (!Array.isArray(data.transactions)) throw new Error(); state.transactions = data.transactions; if (Array.isArray(data.goals)) state.goals = data.goals; save(); render(); toast("Dados restaurados com sucesso"); } catch { toast("Arquivo de backup inválido"); } }; reader.readAsText(file); event.target.value = "";
  });
  if (localStorage.getItem(THEME_KEY) === "dark") document.querySelector("#app").classList.add("dark");
  render();
})();
