const DATABASE_ID_PROPERTY = 'FINANCE_DATABASE_SPREADSHEET_ID';
const UPDATED_AT_PROPERTY = 'FINANCE_DATABASE_UPDATED_AT';
const ENTRY_HEADERS = ['id', 'date', 'type', 'description', 'amount', 'category', 'status', 'dueDate', 'account', 'notes', 'source'];
const BUDGET_HEADERS = ['month', 'category', 'amount'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Controle Financeiro Familiar')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function initializeFinanceSystem() {
  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) throw new Error('Abra este projeto Apps Script pela planilha que será usada como banco de dados.');

  PropertiesService.getScriptProperties().setProperty(DATABASE_ID_PROPERTY, activeSpreadsheet.getId());
  const sheets = ensureFinanceSheets_(activeSpreadsheet);
  if (sheets.entries.getLastRow() <= 1) {
    const entries = buildInitialEntries_();
    writeEntries_(sheets.entries, entries);
    PropertiesService.getScriptProperties().setProperty(UPDATED_AT_PROPERTY, new Date().toISOString());
  }
  return `Planilha configurada: ${activeSpreadsheet.getName()}`;
}

function getFinanceData() {
  requireGoogleUser_();
  const spreadsheet = getDatabaseSpreadsheet_();
  const sheets = ensureFinanceSheets_(spreadsheet);
  return {
    userEmail: Session.getActiveUser().getEmail(),
    entries: readEntries_(sheets.entries),
    budgets: readBudgets_(sheets.budgets),
    updatedAt: PropertiesService.getScriptProperties().getProperty(UPDATED_AT_PROPERTY) || ''
  };
}

function saveFinanceData(payload) {
  requireGoogleUser_();
  if (!payload || !Array.isArray(payload.entries) || !payload.budgets || typeof payload.budgets !== 'object') {
    throw new Error('Os dados recebidos estao em formato invalido.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const spreadsheet = getDatabaseSpreadsheet_();
    const sheets = ensureFinanceSheets_(spreadsheet);
    writeEntries_(sheets.entries, payload.entries);
    writeBudgets_(sheets.budgets, payload.budgets);
    const updatedAt = new Date().toISOString();
    PropertiesService.getScriptProperties().setProperty(UPDATED_AT_PROPERTY, updatedAt);
    return { updatedAt };
  } finally {
    lock.releaseLock();
  }
}

function requireGoogleUser_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Entre com uma conta Google autorizada a acessar a planilha compartilhada.');
  return email;
}

function getDatabaseSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(DATABASE_ID_PROPERTY);
  if (!spreadsheetId) throw new Error('Execute initializeFinanceSystem no editor do Apps Script antes de publicar o Web App.');
  return SpreadsheetApp.openById(spreadsheetId);
}

function ensureFinanceSheets_(spreadsheet) {
  let entries = spreadsheet.getSheetByName('Lancamentos');
  if (!entries) entries = spreadsheet.insertSheet('Lancamentos');
  if (entries.getLastRow() === 0) entries.getRange(1, 1, 1, ENTRY_HEADERS.length).setValues([ENTRY_HEADERS]);

  let budgets = spreadsheet.getSheetByName('Orcamentos');
  if (!budgets) budgets = spreadsheet.insertSheet('Orcamentos');
  if (budgets.getLastRow() === 0) budgets.getRange(1, 1, 1, BUDGET_HEADERS.length).setValues([BUDGET_HEADERS]);
  return { entries, budgets };
}

function readEntries_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length).getValues();
  return rows.filter(row => row[0]).map(row => ({
    id: String(row[0]), date: normalizeDate_(row[1]), type: String(row[2] || 'despesa'),
    description: String(row[3] || ''), amount: Number(row[4] || 0), category: String(row[5] || ''),
    status: String(row[6] || 'pendente'), dueDate: normalizeDate_(row[7]), account: String(row[8] || ''),
    notes: String(row[9] || ''), source: String(row[10] || '')
  }));
}

function readBudgets_(sheet) {
  const lastRow = sheet.getLastRow();
  const budgets = {};
  if (lastRow < 2) return budgets;
  sheet.getRange(2, 1, lastRow - 1, BUDGET_HEADERS.length).getValues().forEach(row => {
    if (row[0] && row[1]) budgets[`${row[0]}|${row[1]}`] = Number(row[2] || 0);
  });
  return budgets;
}

function writeEntries_(sheet, entries) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, ENTRY_HEADERS.length).clearContent();
  if (!entries.length) return;
  const rows = entries.map(entry => [
    safeText_(entry.id), safeText_(entry.date), safeText_(entry.type), safeText_(entry.description),
    Number(entry.amount || 0), safeText_(entry.category), safeText_(entry.status), safeText_(entry.dueDate),
    safeText_(entry.account), safeText_(entry.notes), safeText_(entry.source)
  ]);
  sheet.getRange(2, 1, rows.length, ENTRY_HEADERS.length).setValues(rows);
}

function writeBudgets_(sheet, budgets) {
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, BUDGET_HEADERS.length).clearContent();
  const rows = Object.entries(budgets).map(([key, amount]) => {
    const [month, category] = key.split('|');
    return [safeText_(month), safeText_(category), Number(amount || 0)];
  }).filter(row => row[0] && row[1]);
  if (rows.length) sheet.getRange(2, 1, rows.length, BUDGET_HEADERS.length).setValues(rows);
}

function safeText_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+@\-]/.test(text) ? `'${text}` : text;
}

function normalizeDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '');
}

function buildInitialEntries_() {
  const seeds = getInitialFinancialEntries_();
  const expenses = seeds.filter(entry => entry.type === 'despesa');
  const incomes = seeds.filter(entry => entry.type === 'receita').slice(0, 4);
  const entries = [];

  expenses.forEach((seed, index) => {
    const match = String(seed.notes || '').match(/(\d+)\s*x/i);
    const installmentCount = Math.max(1, Number(match && match[1]) || 1);
    const count = Math.min(installmentCount, 36);
    const base = new Date(`${seed.date}T00:00:00`);
    for (let period = 0; period < count; period++) {
      const target = new Date(base.getFullYear(), base.getMonth() + period, 1);
      target.setDate(Math.min(base.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
      const date = Utilities.formatDate(target, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      entries.push({
        ...seed, id: `google_seed_${index + 1}_${date.slice(0, 7)}`, date, dueDate: date,
        status: 'pendente', source: 'familia_seed',
        notes: `Parcela ${period + 1}/${installmentCount} - Previsao inicial`
      });
    }
  });

  ['2026-11', '2026-12'].forEach(month => incomes.forEach((seed, index) => {
    const date = `${month}-01`;
    entries.push({
      ...seed, id: `google_seed_income_${month}_${index + 1}`, date, dueDate: date,
      category: /salario/i.test(seed.description) ? 'Salario' : 'Renda extra', status: 'pendente',
      account: 'Familia', source: 'familia_seed', notes: 'Receita prevista; pagamento nao confirmado'
    });
  }));
  return entries;
}
