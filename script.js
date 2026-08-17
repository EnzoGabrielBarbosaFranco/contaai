(() => {
  "use strict";

  const STORAGE_KEY = "contaai-transactions-v2";
  const GOALS_KEY = "contaai-goals-v2";
  const CATEGORIES_KEY = "contaai-categories-v1";
  const UI_STATE_KEY = "contaai-ui-state-v1";
  const THEME_KEY = "meu-dinheiro-static-theme";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const shortMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  const colors = { Moradia: "#106EBE", Alimentação: "#08B98C", Transporte: "#398ED3", Lazer: "#0DD8A6", Saúde: "#0B5B9B", Educação: "#51A5E6", Assinaturas: "#08A77F", Compras: "#287FCA", Salário: "#08B98C", Freelance: "#106EBE", Investimentos: "#0CD9A7", Outros: "#6C9FC9" };
  const defaultCategories = [
    ...["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Assinaturas", "Compras"].map(name => ({ name, type: "expense", color: colors[name] })),
    ...["Salário", "Freelance", "Investimentos"].map(name => ({ name, type: "income", color: colors[name] })),
    { name: "Outros", type: "both", color: colors.Outros }
  ];
  const customColors = ["#106EBE", "#0FFCBE", "#398ED3", "#08B98C", "#0B5B9B", "#51A5E6", "#0DD8A6", "#287FCA"];
  const goalColors = ["#106EBE", "#08B98C", "#398ED3", "#0DD8A6"];
  const icon = (name, className = "") => `<svg class="icon ${className}" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const icons = { balance: icon("wallet"), income: icon("arrow-up-right"), expense: icon("arrow-down-right"), savings: icon("piggy-bank") };

  const pad = value => String(value).padStart(2, "0");
  const toISO = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const parseDate = value => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
  const monthKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const escapeHTML = value => String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  const savedUI = load(UI_STATE_KEY, {});
  const today = new Date();
  const savedAnchor = /^\d{4}-\d{2}-\d{2}$/.test(savedUI.anchor || "") ? parseDate(savedUI.anchor) : today;
  const state = {
    transactions: load(STORAGE_KEY, []),
    goals: load(GOALS_KEY, []),
    categories: load(CATEGORIES_KEY, defaultCategories),
    period: ["day", "week", "month", "year", "range"].includes(savedUI.period) ? savedUI.period : "month",
    anchor: savedAnchor,
    rangeStart: /^\d{4}-\d{2}-\d{2}$/.test(savedUI.rangeStart || "") ? savedUI.rangeStart : toISO(new Date(today.getFullYear(), today.getMonth(), 1)),
    rangeEnd: /^\d{4}-\d{2}-\d{2}$/.test(savedUI.rangeEnd || "") ? savedUI.rangeEnd : toISO(today),
    search: typeof savedUI.search === "string" ? savedUI.search : "",
    typeFilter: ["all", "expense", "income"].includes(savedUI.typeFilter) ? savedUI.typeFilter : "all",
    categoryFilter: typeof savedUI.categoryFilter === "string" ? savedUI.categoryFilter : "all",
    view: ["dashboard", "transactions", "recurring", "goals"].includes(savedUI.view) ? savedUI.view : "dashboard",
    transactionType: ["expense", "income"].includes(savedUI.transactionType) ? savedUI.transactionType : "expense"
  };
  state.categories = state.categories.map((category, index) => {
    const normalized = typeof category === "string" ? { name: category, type: "both" } : category;
    return { ...normalized, color: colors[normalized.name] || customColors[index % customColors.length] };
  });
  state.goals = state.goals.map((goal, index) => ({ ...goal, color: goalColors[index % goalColors.length] }));
  state.categories.forEach(category => { colors[category.name] = category.color || colors.Outros; });

  function load(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
    localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals));
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(state.categories));
  }
  function saveUI(overrides = {}) {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify({
      view: state.view,
      period: state.period,
      anchor: toISO(state.anchor),
      rangeStart: state.rangeStart,
      rangeEnd: state.rangeEnd,
      search: state.search,
      typeFilter: state.typeFilter,
      categoryFilter: state.categoryFilter,
      transactionType: state.transactionType,
      scrollY: Math.round(window.scrollY),
      ...overrides
    }));
  }
  function inPeriod(date, period, anchor) {
    if (period === "range") return date >= parseDate(state.rangeStart) && date <= parseDate(state.rangeEnd);
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
      .filter(item => state.typeFilter === "all" || item.type === state.typeFilter)
      .filter(item => state.categoryFilter === "all" || item.category === state.categoryFilter)
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
    renderCategoryFilters();
    renderSummary(total, items);
    renderMonthlyChart();
    renderCategoryChart(groups(items), total.expenses);
    renderTransactions(items);
    renderInsights(groups(items), total);
    renderRecurring();
    renderGoals();
    document.querySelectorAll(".search-input").forEach(input => { input.value = state.search; });
  }

  function renderPeriodLabel() {
    const options = state.period === "day" ? { day: "2-digit", month: "long", year: "numeric" } : state.period === "month" ? { month: "long", year: "numeric" } : null;
    let label;
    if (state.period === "range") {
      const compactDate = value => parseDate(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
      label = `${compactDate(state.rangeStart)} – ${compactDate(state.rangeEnd)}`;
    }
    else if (state.period === "week") label = `Semana de ${state.anchor.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;
    else if (state.period === "year") label = String(state.anchor.getFullYear());
    else label = state.anchor.toLocaleDateString("pt-BR", options);
    document.querySelector("#periodLabel").textContent = label;
  }
  function renderTabs() {
    const labels = { day: "Dia", week: "Semana", month: "Mês", year: "Ano", range: "Datas" };
    const html = Object.entries(labels).map(([key, label]) => `<button class="${state.period === key ? "active" : ""}" data-period="${key}">${label}</button>`).join("");
    document.querySelectorAll(".period-tabs-slot").forEach(slot => slot.innerHTML = html);
    const rangeHTML = state.period === "range" ? `<div class="date-range"><label>De<input type="date" data-range-start value="${state.rangeStart}" max="${state.rangeEnd}"></label><span>até</span><label>Até<input type="date" data-range-end value="${state.rangeEnd}" min="${state.rangeStart}"></label></div>` : "";
    document.querySelectorAll(".date-range-slot").forEach(slot => slot.innerHTML = rangeHTML);
  }
  function renderCategoryFilters() {
    const categoryFilter = document.querySelector("#categoryFilter");
    const typeFilter = document.querySelector("#typeFilter");
    const names = [...new Set([...state.categories.map(category => category.name), ...state.transactions.map(item => item.category)])].sort((a, b) => a.localeCompare(b, "pt-BR"));
    categoryFilter.innerHTML = `<option value="all">Todas as categorias</option>${names.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("")}`;
    categoryFilter.value = names.includes(state.categoryFilter) ? state.categoryFilter : "all";
    if (categoryFilter.value === "all") state.categoryFilter = "all";
    typeFilter.value = state.typeFilter;
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
    const chartItems = state.transactions
      .filter(item => state.typeFilter === "all" || item.type === state.typeFilter)
      .filter(item => state.categoryFilter === "all" || item.category === state.categoryFilter);
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(state.anchor.getFullYear(), state.anchor.getMonth() - 5 + index, 1);
      const monthItems = chartItems.filter(item => item.date.startsWith(monthKey(date)));
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
    target.innerHTML = `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparação de entradas e despesas dos últimos seis meses"><defs><linearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0FFCBE" stop-opacity=".22"/><stop offset="1" stop-color="#0FFCBE" stop-opacity="0"/></linearGradient></defs>${ticks.map(tick => { const y = top + chartHeight * (1 - tick); return `<line class="chart-gridline" x1="${left}" x2="${width - right}" y1="${y}" y2="${y}"/><text class="axis-label" x="${left - 12}" y="${y + 3}" text-anchor="end">${shortMoney.format(maximum * tick)}</text>`; }).join("")}<path class="chart-area-fill" d="${area}"/><path class="chart-line expense-line" d="${path(expensePoints)}"/><path class="chart-line income-line" d="${path(incomePoints)}"/>${incomePoints.map((point, index) => `<g><circle class="chart-point income-point" cx="${point.x}" cy="${point.y}" r="4"><title>Entradas em ${months[index].label}: ${money.format(point.value)}</title></circle><text class="month-label" x="${point.x}" y="${height - 12}" text-anchor="middle">${months[index].label}</text></g>`).join("")}${expensePoints.map((point, index) => `<circle class="chart-point expense-point" cx="${point.x}" cy="${point.y}" r="4"><title>Despesas em ${months[index].label}: ${money.format(point.value)}</title></circle>`).join("")}</svg>`;
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
    return `<div class="transaction-row"><div class="transaction-symbol" style="background:${colors[item.category] || colors.Outros}18;color:${colors[item.category] || colors.Outros}">${icon(item.type === "income" ? "arrow-up-right" : "arrow-down-right")}</div><div class="transaction-main"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.category)} · ${escapeHTML(item.account)}</span></div><time>${parseDate(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</time><span class="transaction-category">${escapeHTML(item.category)}</span><strong class="amount ${item.type === "income" ? "income-text" : "expense-text"}">${sign}${money.format(item.amount)}</strong><button class="delete-button" data-delete="${item.id}" aria-label="Excluir lançamento">${icon("trash")}</button></div>`;
  }
  function renderTransactions(items) {
    document.querySelector("#recentTransactions").innerHTML = items.length ? items.slice(0, 6).map(transactionRow).join("") : empty("Nenhum lançamento encontrado.");
    document.querySelector("#transactionCount").textContent = `${items.length} ${items.length === 1 ? "lançamento" : "lançamentos"}`;
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

  function activateView(view) {
    document.querySelectorAll(".view").forEach(section => section.classList.toggle("active", section.id === `${view}View`));
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  }
  function switchView(view) {
    state.view = view;
    activateView(view);
    document.querySelector("#sidebar").classList.remove("open");
    document.querySelector("#scrim").classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
    saveUI({ scrollY: 0 });
  }
  function openTransaction(type) {
    state.transactionType = type;
    saveUI();
    document.querySelector("#transactionModalTitle").textContent = type === "income" ? "Registrar entrada" : "Registrar despesa";
    document.querySelector("#fixedField").classList.toggle("hidden", type === "income");
    const form = document.querySelector("#transactionForm"); form.reset(); form.elements.date.value = toISO(new Date());
    renderTransactionCategories();
    closeCategoryField();
    document.querySelector("#transactionModal").classList.remove("hidden");
    setTimeout(() => form.elements.title.focus(), 50);
  }
  function renderTransactionCategories(selected = "") {
    const allowed = state.categories.filter(category => category.type === state.transactionType || category.type === "both");
    const select = document.querySelector("#categorySelect");
    select.innerHTML = allowed.map(category => `<option value="${escapeHTML(category.name)}">${escapeHTML(category.name)}</option>`).join("");
    if (selected && allowed.some(category => category.name === selected)) select.value = selected;
  }
  function closeCategoryField() {
    document.querySelector("#categoryCreateField").classList.add("hidden");
    document.querySelector("#newCategoryName").value = "";
  }
  function createCategory() {
    const input = document.querySelector("#newCategoryName");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) { input.focus(); return; }
    const existing = state.categories.find(category => category.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0);
    if (existing) {
      if (existing.type !== state.transactionType && existing.type !== "both") existing.type = "both";
      renderTransactionCategories(existing.name); save(); closeCategoryField(); toast("Categoria disponível para este lançamento"); return;
    }
    const color = customColors[state.categories.length % customColors.length];
    state.categories.push({ name, type: state.transactionType, color });
    colors[name] = color;
    save(); renderTransactionCategories(name); renderCategoryFilters(); closeCategoryField(); toast("Categoria criada com sucesso");
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
    if (button.dataset.period) { state.period = button.dataset.period; render(); saveUI(); }
    if (button.id === "openCategoryField") { document.querySelector("#categoryCreateField").classList.remove("hidden"); setTimeout(() => document.querySelector("#newCategoryName").focus(), 0); }
    if (button.id === "cancelCategory") closeCategoryField();
    if (button.id === "saveCategory") createCategory();
    if (button.dataset.delete) { state.transactions = state.transactions.filter(item => item.id !== button.dataset.delete); save(); render(); toast("Lançamento excluído"); }
    if (button.dataset.deleteGoal) { state.goals = state.goals.filter(goal => goal.id !== button.dataset.deleteGoal); save(); render(); toast("Meta excluída"); }
    if (button.matches(".close-modal")) closeModals();
    if (button.matches(".export-btn")) exportCSV();
    if (button.hasAttribute("data-scroll-categories")) document.querySelector(".category-chart").scrollIntoView({ behavior: "smooth" });
  });
  document.addEventListener("change", event => {
    if (event.target.matches("[data-toggle-paid]")) { state.transactions = state.transactions.map(item => item.id === event.target.dataset.togglePaid ? { ...item, paid: event.target.checked } : item); save(); render(); }
    if (event.target.id === "typeFilter") { state.typeFilter = event.target.value; render(); saveUI(); }
    if (event.target.id === "categoryFilter") { state.categoryFilter = event.target.value; render(); saveUI(); }
    if (event.target.matches("[data-range-start]")) { if (!event.target.value) { render(); return; } state.rangeStart = event.target.value; if (state.rangeStart > state.rangeEnd) state.rangeEnd = state.rangeStart; render(); saveUI(); }
    if (event.target.matches("[data-range-end]")) { if (!event.target.value) { render(); return; } state.rangeEnd = event.target.value; if (state.rangeEnd < state.rangeStart) state.rangeStart = state.rangeEnd; render(); saveUI(); }
  });
  document.querySelector("#newCategoryName").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); createCategory(); } });
  document.querySelectorAll(".search-input").forEach(input => input.addEventListener("input", event => { state.search = event.target.value; document.querySelectorAll(".search-input").forEach(other => { if (other !== event.target) other.value = state.search; }); render(); saveUI(); }));
  document.querySelector("#transactionForm").addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const recurring = data.get("recurring") === "on";
    state.transactions.unshift({ id: uid(), title: data.get("title").trim(), amount: Number(data.get("amount")), type: state.transactionType, category: data.get("category"), date: data.get("date"), account: data.get("account"), note: data.get("note").trim(), recurring, paid: recurring ? false : true });
    save(); closeModals(); render(); toast(state.transactionType === "income" ? "Entrada registrada com sucesso" : "Despesa registrada com sucesso");
  });
  document.querySelector("#goalForm").addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); state.goals.push({ id: uid(), title: data.get("title").trim(), target: Number(data.get("target")), saved: Number(data.get("saved") || 0), color: goalColors[state.goals.length % goalColors.length] }); save(); closeModals(); event.currentTarget.reset(); render(); toast("Meta criada com sucesso");
  });
  document.querySelector("#goalsGrid").addEventListener("submit", event => {
    const form = event.target.closest(".deposit-form"); if (!form) return; event.preventDefault(); const amount = Number(form.querySelector("input").value); state.goals = state.goals.map(goal => goal.id === form.dataset.goal ? { ...goal, saved: Math.min(goal.target, goal.saved + amount) } : goal); save(); render(); toast("Aporte registrado");
  });
  document.querySelector("#prevPeriod").addEventListener("click", () => movePeriod(-1));
  document.querySelector("#nextPeriod").addEventListener("click", () => movePeriod(1));
  function movePeriod(direction) {
    if (state.period === "range") {
      const start = parseDate(state.rangeStart), end = parseDate(state.rangeEnd);
      const span = Math.round((end - start) / 86400000) + 1;
      start.setDate(start.getDate() + direction * span); end.setDate(end.getDate() + direction * span);
      state.rangeStart = toISO(start); state.rangeEnd = toISO(end);
    } else if (state.period === "day") state.anchor.setDate(state.anchor.getDate() + direction);
    else if (state.period === "week") state.anchor.setDate(state.anchor.getDate() + direction * 7);
    else if (state.period === "month") state.anchor.setMonth(state.anchor.getMonth() + direction);
    else state.anchor.setFullYear(state.anchor.getFullYear() + direction);
    state.anchor = new Date(state.anchor); render(); saveUI();
  }
  document.querySelector("#themeBtn").addEventListener("click", () => { document.querySelector("#app").classList.toggle("dark"); localStorage.setItem(THEME_KEY, document.querySelector("#app").classList.contains("dark") ? "dark" : "light"); });
  document.querySelector("#openMenu").addEventListener("click", () => { document.querySelector("#sidebar").classList.add("open"); document.querySelector("#scrim").classList.add("active"); });
  ["#closeMenu", "#scrim"].forEach(selector => document.querySelector(selector).addEventListener("click", () => { document.querySelector("#sidebar").classList.remove("open"); document.querySelector("#scrim").classList.remove("active"); }));
  document.querySelector("#openGoal").addEventListener("click", () => document.querySelector("#goalModal").classList.remove("hidden"));
  document.querySelectorAll(".modal-backdrop").forEach(modal => modal.addEventListener("mousedown", event => { if (event.target === modal) closeModals(); }));
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
  document.querySelector("#backupBtn").addEventListener("click", () => { download(JSON.stringify({ transactions: state.transactions, goals: state.goals, categories: state.categories }, null, 2), `backup-meu-dinheiro-${toISO(new Date())}.json`, "application/json"); toast("Backup criado com sucesso"); });
  document.querySelector("#restoreBtn").addEventListener("click", () => document.querySelector("#restoreInput").click());
  document.querySelector("#restoreInput").addEventListener("change", event => {
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(reader.result); if (!Array.isArray(data.transactions)) throw new Error(); state.transactions = data.transactions; if (Array.isArray(data.goals)) state.goals = data.goals.map((goal, index) => ({ ...goal, color: goalColors[index % goalColors.length] })); if (Array.isArray(data.categories)) { state.categories = data.categories.map((category, index) => ({ ...category, color: colors[category.name] || customColors[index % customColors.length] })); state.categories.forEach(category => { colors[category.name] = category.color || colors.Outros; }); } save(); render(); toast("Dados restaurados com sucesso"); } catch { toast("Arquivo de backup inválido"); } }; reader.readAsText(file); event.target.value = "";
  });
  let scrollSaveTimer;
  window.addEventListener("scroll", () => { clearTimeout(scrollSaveTimer); scrollSaveTimer = setTimeout(() => saveUI(), 120); }, { passive: true });
  window.addEventListener("beforeunload", () => saveUI());
  if (localStorage.getItem(THEME_KEY) === "dark") document.querySelector("#app").classList.add("dark");
  activateView(state.view);
  render();
  setTimeout(() => window.scrollTo({ top: Number.isFinite(savedUI.scrollY) ? savedUI.scrollY : 0, behavior: "auto" }), 80);
})();
