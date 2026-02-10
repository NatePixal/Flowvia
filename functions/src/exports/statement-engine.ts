// File: functions/src/exports/statement-engine.ts
import * as ExcelJS from 'exceljs';
import { excelNumFmtForCurrency, minorToMajor } from './money';
import type { StatementRow, StatementSummary } from './types';
import { applyGlobalWorkbookStyle, setSheetPrintDefaults, styleTableHeader, styleTableBodyRow } from './exportUtils';

type Locale = 'en' | 'ru' | 'uz' | 'ar';

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    company: 'FlowVia Business Solutions',
    // keep template spelling to match
    expenses: 'Expenses',
    clientStatment: 'Client Statment',
    supplierStatment: 'Supplier Statment',
    productStatment: 'Product Statment',

    dateRange: 'Date Range from {from} to {to}',
    name: 'Name',
    balance: 'Balance',
    status: 'Status',
    hasLoan: 'Has Loan',
    overpaid: 'Overpaid',
    settled: 'Settled',
    payable: 'Payable',

    clientLedger: 'Client Ledger',
    supplierLedger: 'Supplier Ledger',
    amountPaid: 'Amount Paid',

    h_date: 'Date',
    h_description: 'Description',
    h_expenseType: 'Expense type',
    h_price: 'Price',
    h_currency: 'Currency',
    h_exchangeRate: 'Exchange Rate',

    h_productBought: 'Product Bought',
    h_qty: 'QTY',
    h_soldPrice: 'Sold Price',
    h_contractAmount: 'Contract Amount',
    h_paidDate: 'Paid Date',
    h_paid: 'Paid',

    h_priceOrigin: 'Price Origin',

    h_productCode: 'Product Code',
    h_category: 'Catagory',
    h_balanceWas: 'Balance from choosen date "Was"',
    h_qtyLeft: 'QTY Left',
    h_sellingPrice: 'Selling Price',
    h_profit: 'Profit',
    h_remainingValue: 'Price of All Remaining Product',

    noData: 'No data available for the selected period.',

    // Summary sheet labels
    sum_entity: 'Entity',
    sum_period: 'Period',
    sum_base: 'Base Currency',
    sum_opening: 'Opening',
    sum_totalDebit: 'Total Debit',
    sum_totalCredit: 'Total Credit',
    sum_closing: 'Closing',
    sum_warnings: 'Warnings',
    sum_totalsByCur: 'Totals by currency (original)',
    sum_currency: 'Currency',
    sum_debit: 'Debit',
    sum_credit: 'Credit',
    sum_exportVer: 'Export version: {v}',
    dash: '—',
  },
  ru: {
    company: 'FlowVia Business Solutions',
    expenses: 'Расходы',
    clientStatment: 'Отчет клиента',
    supplierStatment: 'Отчет поставщика',
    productStatment: 'Отчет по продукту',
    dateRange: 'Диапазон дат: {from} — {to}',
    name: 'Имя',
    balance: 'Баланс',
    status: 'Статус',
    hasLoan: 'Есть долг',
    overpaid: 'Переплата',
    settled: 'Закрыто',
    payable: 'К оплате',
    clientLedger: 'Леджер клиента',
    supplierLedger: 'Леджер поставщика',
    amountPaid: 'Оплачено',
    h_date: 'Дата',
    h_description: 'Описание',
    h_expenseType: 'Тип расхода',
    h_price: 'Сумма',
    h_currency: 'Валюта',
    h_exchangeRate: 'Курс',
    h_productBought: 'Товар',
    h_qty: 'Кол-во',
    h_soldPrice: 'Цена продажи',
    h_contractAmount: 'Сумма договора',
    h_paidDate: 'Дата оплаты',
    h_paid: 'Оплачено',
    h_priceOrigin: 'Цена закупки',
    h_productCode: 'Код товара',
    h_category: 'Категория',
    h_balanceWas: 'Остаток на дату',
    h_qtyLeft: 'Остаток (кол-во)',
    h_sellingPrice: 'Цена продажи',
    h_profit: 'Прибыль',
    h_remainingValue: 'Стоимость остатка',
    noData: 'Нет данных за выбранный период.',
    sum_entity: 'Сущность',
    sum_period: 'Период',
    sum_base: 'Базовая валюта',
    sum_opening: 'Открытие',
    sum_totalDebit: 'Дебет всего',
    sum_totalCredit: 'Кредит всего',
    sum_closing: 'Закрытие',
    sum_warnings: 'Предупреждения',
    sum_totalsByCur: 'Итоги по валютам (ориг.)',
    sum_currency: 'Валюта',
    sum_debit: 'Дебет',
    sum_credit: 'Кредит',
    sum_exportVer: 'Версия экспорта: {v}',
    dash: '—',
  },
  uz: {
    company: 'FlowVia Business Solutions',
    expenses: 'Xarajatlar',
    clientStatment: 'Mijoz hisoboti',
    supplierStatment: 'Yetkazib beruvchi hisoboti',
    productStatment: 'Mahsulot hisoboti',
    dateRange: 'Sana oralig‘i: {from} — {to}',
    name: 'Nomi',
    balance: 'Balans',
    status: 'Holati',
    hasLoan: 'Qarz bor',
    overpaid: 'Ortiqcha to‘lov',
    settled: 'Yopilgan',
    payable: 'To‘lanadi',
    clientLedger: 'Mijoz ledjeri',
    supplierLedger: 'Yetkazib beruvchi ledjeri',
    amountPaid: 'To‘langan',
    h_date: 'Sana',
    h_description: 'Tavsif',
    h_expenseType: 'Xarajat turi',
    h_price: 'Summa',
    h_currency: 'Valyuta',
    h_exchangeRate: 'Kurs',
    h_productBought: 'Olingan mahsulot',
    h_qty: 'Miqdor',
    h_soldPrice: 'Sotuv narxi',
    h_contractAmount: 'Shartnoma summasi',
    h_paidDate: 'To‘lov sanasi',
    h_paid: 'To‘langan',
    h_priceOrigin: 'Asl narx',
    h_productCode: 'Mahsulot kodi',
    h_category: 'Kategoriya',
    h_balanceWas: 'Boshlang‘ich qoldiq',
    h_qtyLeft: 'Qolgan miqdor',
    h_sellingPrice: 'Sotuv narxi',
    h_profit: 'Foyda',
    h_remainingValue: 'Qolgan mahsulot qiymati',
    noData: 'Tanlangan davr uchun ma’lumot yo‘q.',
    sum_entity: 'Subyekt',
    sum_period: 'Davr',
    sum_base: 'Asosiy valyuta',
    sum_opening: 'Boshlanish',
    sum_totalDebit: 'Jami debet',
    sum_totalCredit: 'Jami kredit',
    sum_closing: 'Yakun',
    sum_warnings: 'Ogohlantirishlar',
    sum_totalsByCur: 'Valyutalar bo‘yicha (asl)',
    sum_currency: 'Valyuta',
    sum_debit: 'Debet',
    sum_credit: 'Kredit',
    sum_exportVer: 'Eksport versiyasi: {v}',
    dash: '—',
  },
  ar: {
    company: 'FlowVia Business Solutions',
    expenses: 'المصروفات',
    clientStatment: 'كشف حساب العميل',
    supplierStatment: 'كشف حساب المورد',
    productStatment: 'كشف المنتج',
    dateRange: 'الفترة: {from} — {to}',
    name: 'الاسم',
    balance: 'الرصيد',
    status: 'الحالة',
    hasLoan: 'عليه مديونية',
    overpaid: 'دفعة زائدة',
    settled: 'مُسوى',
    payable: 'مستحق الدفع',
    clientLedger: 'دفتر العميل',
    supplierLedger: 'دفتر المورد',
    amountPaid: 'المدفوع',
    h_date: 'التاريخ',
    h_description: 'الوصف',
    h_expenseType: 'نوع المصروف',
    h_price: 'المبلغ',
    h_currency: 'العملة',
    h_exchangeRate: 'سعر الصرف',
    h_productBought: 'المنتج',
    h_qty: 'الكمية',
    h_soldPrice: 'سعر البيع',
    h_contractAmount: 'قيمة العقد',
    h_paidDate: 'تاريخ الدفع',
    h_paid: 'مدفوع',
    h_priceOrigin: 'سعر الشراء',
    h_productCode: 'كود المنتج',
    h_category: 'الفئة',
    h_balanceWas: 'الرصيد عند البداية',
    h_qtyLeft: 'المتبقي',
    h_sellingPrice: 'سعر البيع',
    h_profit: 'الربح',
    h_remainingValue: 'قيمة المتبقي',
    noData: 'لا توجد بيانات للفترة المحددة.',
    sum_entity: 'الجهة',
    sum_period: 'الفترة',
    sum_base: 'العملة الأساسية',
    sum_opening: 'الرصيد الافتتاحي',
    sum_totalDebit: 'إجمالي المدين',
    sum_totalCredit: 'إجمالي الدائن',
    sum_closing: 'الرصيد الختامي',
    sum_warnings: 'تنبيهات',
    sum_totalsByCur: 'الإجماليات حسب العملة (أصلي)',
    sum_currency: 'العملة',
    sum_debit: 'مدين',
    sum_credit: 'دائن',
    sum_exportVer: 'إصدار التصدير: {v}',
    dash: '—',
  },
};

function t(locale: string | undefined, key: string, params?: Record<string, string>): string {
  const lang: Record<string, string> = TRANSLATIONS[(locale as Locale) || 'en'] || TRANSLATIONS.en;
  let s = lang[key] ?? TRANSLATIONS.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(v);
  return s;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function safeNumFmt(currency: string): string {
  try { return excelNumFmtForCurrency(currency) || '#,##0.00'; } catch { return '#,##0.00'; }
}

function entityNameFromLabel(label: string): string {
  return String(label || '')
    .replace(/^Client:\s*/i, '')
    .replace(/^Supplier:\s*/i, '')
    .replace(/^Product:\s*/i, '')
    .trim();
}

function statusForClient(closing: number, locale?: string) {
  if (closing > 0) return t(locale, 'hasLoan');
  if (closing < 0) return t(locale, 'overpaid');
  return t(locale, 'settled');
}

function statusForSupplier(closing: number, locale?: string) {
  if (closing < 0) return t(locale, 'overpaid');
  if (closing > 0) return t(locale, 'payable');
  return t(locale, 'settled');
}

// Prefer entered rate; else invert fxRateToBase (because templates show 12200 style)
function fxDisplay(row: StatementRow, baseCurrency: string): number | null {
  if (row.currency === baseCurrency) return 1;
  const entered = row?.meta?.fxEnteredRate;
  if (typeof entered === 'number' && Number.isFinite(entered) && entered > 0) return entered;
  const r = row.fxRateToBase;
  if (typeof r === 'number' && Number.isFinite(r) && r > 0) return 1 / r;
  return null;
}

function sumQtyFromItems(items: any): number | null {
  if (!Array.isArray(items) || !items.length) return null;
  let s = 0;
  let ok = false;
  for (const it of items) {
    const q = Number(it?.qty ?? it?.quantity ?? 0);
    if (Number.isFinite(q) && q) { s += q; ok = true; }
  }
  return ok ? s : null;
}

function unitPriceFromItems(items: any, currency: string): number | null {
  if (!Array.isArray(items) || !items.length) return null;
  const keys = ['unitPrice', 'sellPrice', 'sellingPrice', 'price', 'unitPriceMinor', 'sellPriceMinor', 'sellingPriceMinor', 'priceMinor'];
  for (const it of items) {
    for (const k of keys) {
      if (it?.[k] == null) continue;
      const v = Number(it[k]);
      if (!Number.isFinite(v) || v <= 0) continue;
      // If key ends with Minor => convert
      if (String(k).toLowerCase().includes('minor')) return minorToMajor(v, currency);
      return v;
    }
  }
  return null;
}

function applyRTL(ws: ExcelJS.Worksheet, locale?: string) {
  if (locale === 'ar') {
    ws.views = [{ rightToLeft: true }];
  }
}

function setBold(ws: ExcelJS.Worksheet, addr: string, val: any, size?: number) {
  const c = ws.getCell(addr);
  c.value = val;
  c.font = { name: 'Arial', bold: true, ...(size ? { size } : {}) };
  if (ws.views?.[0]?.rightToLeft) c.alignment = { horizontal: 'right' };
}

function setText(ws: ExcelJS.Worksheet, addr: string, val: any) {
  const c = ws.getCell(addr);
  c.value = val;
  if (ws.views?.[0]?.rightToLeft) c.alignment = { horizontal: 'right' };
}

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  styleTableHeader(ws, row, startCol, endCol);
}

function styleBodyRow(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
  styleTableBodyRow(ws, row, startCol, endCol);
}

function buildExpensesSheet(ws: ExcelJS.Worksheet, summary: StatementSummary, rows: StatementRow[], baseCurrency: string, locale?: string) {
  applyRTL(ws, locale);
  setSheetPrintDefaults(ws);

  ws.getColumn('A').width = 15;
  ws.getColumn('B').width = 40;
  ws.getColumn('C').width = 28;
  ws.getColumn('D').width = 15;
  ws.getColumn('E').width = 12;
  ws.getColumn('F').width = 18;

  setBold(ws, 'B5', t(locale, 'company'), 16);
  setBold(ws, 'B7', t(locale, 'expenses'), 12);
  setBold(ws, 'A9', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  // Header row 10
  ws.getRow(10).values = [
    t(locale, 'h_date'),
    t(locale, 'h_description'),
    t(locale, 'h_expenseType'),
    t(locale, 'h_price'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
  ];
  styleHeaderRow(ws, 10, 1, 6);

  if (!rows.length) {
    ws.getCell('A11').value = t(locale, 'noData');
    return;
  }

  let r = 11;
  for (const x of rows) {
    const cat = x.meta?.category ?? (x as any).category ?? '';
    const price = (typeof x.debitOrig === 'number' ? x.debitOrig : (x.meta?.amountOrig ?? null));
    const fx = fxDisplay(x, baseCurrency);

    ws.getRow(r).values = [
      x.businessDate,
      x.description ?? '',
      cat ?? '',
      price ?? '',
      x.currency ?? '',
      fx ?? '',
    ];

    // formats
    ws.getCell(r, 1).numFmt = 'yyyy-mm-dd';
    ws.getCell(r, 4).numFmt = safeNumFmt(String(x.currency || baseCurrency));
    ws.getCell(r, 6).numFmt = '0.########';

    styleBodyRow(ws, r, 1, 6);
    r++;
  }
}

function buildClientSheet(ws: ExcelJS.Worksheet, summary: StatementSummary, rows: StatementRow[], baseCurrency: string, locale?: string) {
  applyRTL(ws, locale);
  setSheetPrintDefaults(ws);

  // widths A..L
  const widths = [15, 40, 18, 16, 12, 14, 18, 4, 15, 12, 14, 18];
  for (let i = 1; i <= 12; i++) ws.getColumn(i).width = widths[i - 1];

  setBold(ws, 'B3', t(locale, 'company'), 16);

  setBold(ws, 'A8', t(locale, 'clientStatment'), 12);
  setBold(ws, 'C8', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  const name = entityNameFromLabel(summary.entityLabel);
  setBold(ws, 'A9', t(locale, 'name'));
  setText(ws, 'B9', name);

  setBold(ws, 'A10', t(locale, 'balance'));
  ws.getCell('B10').value = summary.closingBase;
  ws.getCell('B10').numFmt = safeNumFmt(String(baseCurrency));

  setBold(ws, 'A11', t(locale, 'status'));
  setText(ws, 'B11', statusForClient(summary.closingBase, locale));

  setBold(ws, 'B14', t(locale, 'clientLedger'), 12);
  setBold(ws, 'I14', t(locale, 'amountPaid'), 12);

  setBold(ws, 'A16', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  // Header row 18 (A..L)
  ws.getRow(18).values = [
    t(locale, 'h_date'),
    t(locale, 'h_productBought'),
    t(locale, 'h_qty'),
    t(locale, 'h_soldPrice'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
    t(locale, 'h_contractAmount'),
    '',
    t(locale, 'h_paidDate'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
    t(locale, 'h_paid'),
  ];
  styleHeaderRow(ws, 18, 1, 12);

  if (!rows.length) {
    ws.getCell('A19').value = t(locale, 'noData');
    return;
  }

  let r = 19;
  for (const x of rows) {
    const items = x.meta?.items;
    const qty = sumQtyFromItems(items);
    const unit = unitPriceFromItems(items, String(x.currency || baseCurrency));
    const fx = fxDisplay(x, baseCurrency);

    const isPurchase = String(x.type).toLowerCase() === 'purchase';
    const isPayment = String(x.type).toLowerCase() === 'payment';

    if (isPurchase) {
      ws.getRow(r).values = [
        x.businessDate,
        (Array.isArray(items) && items.length)
          ? items.map((it: any) => String(it?.name ?? it?.productName ?? '')).filter(Boolean).join(', ') || x.description
          : (x.description ?? ''),
        qty ?? '',
        unit ?? '',
        x.currency ?? '',
        fx ?? '',
        (typeof x.debitOrig === 'number' ? x.debitOrig : ''),
        '',
        '',
        '',
        '',
        '',
      ];
      ws.getCell(r, 1).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 4).numFmt = unit ? safeNumFmt(String(x.currency || baseCurrency)) : 'General';
      ws.getCell(r, 7).numFmt = safeNumFmt(String(x.currency || baseCurrency));
      ws.getCell(r, 6).numFmt = '0.########';
    } else if (isPayment) {
      ws.getRow(r).values = [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        x.businessDate,
        x.currency ?? '',
        fx ?? '',
        (typeof x.creditOrig === 'number' ? x.creditOrig : ''),
      ];
      ws.getCell(r, 9).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 12).numFmt = safeNumFmt(String(x.currency || baseCurrency));
      ws.getCell(r, 11).numFmt = '0.########';
    } else {
      // fallback: show as description on left
      ws.getRow(r).values = [
        x.businessDate,
        x.description ?? '',
        '',
        '',
        x.currency ?? '',
        fx ?? '',
        '',
        '',
        '',
        '',
        '',
        '',
      ];
      ws.getCell(r, 1).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 6).numFmt = '0.########';
    }

    styleBodyRow(ws, r, 1, 12);
    r++;
  }
}

function buildSupplierSheet(ws: ExcelJS.Worksheet, summary: StatementSummary, rows: StatementRow[], baseCurrency: string, locale?: string) {
  applyRTL(ws, locale);
  setSheetPrintDefaults(ws);

  // widths A..K
  const widths = [18, 40, 12, 16, 12, 14, 18, 15, 12, 14, 18];
  for (let i = 1; i <= 11; i++) ws.getColumn(i).width = widths[i - 1];

  setBold(ws, 'B3', t(locale, 'company'), 16);

  setBold(ws, 'A6', t(locale, 'supplierStatment'), 12);
  setBold(ws, 'C6', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  const name = entityNameFromLabel(summary.entityLabel);
  setBold(ws, 'A7', t(locale, 'name'));
  setText(ws, 'B7', name);

  setBold(ws, 'A8', t(locale, 'balance'));
  ws.getCell('B8').value = summary.closingBase;
  ws.getCell('B8').numFmt = safeNumFmt(String(baseCurrency));

  setBold(ws, 'A9', t(locale, 'status'));
  setText(ws, 'B9', statusForSupplier(summary.closingBase, locale));

  setBold(ws, 'B13', t(locale, 'supplierLedger'), 12);
  setBold(ws, 'H13', t(locale, 'amountPaid'), 12);

  setBold(ws, 'A15', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  // Header row 17 (A..K)
  ws.getRow(17).values = [
    t(locale, 'h_date'),
    t(locale, 'h_description'),
    t(locale, 'h_qty'),
    t(locale, 'h_priceOrigin'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
    t(locale, 'h_contractAmount'),
    t(locale, 'h_paidDate'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
    t(locale, 'h_paid'),
  ];
  styleHeaderRow(ws, 17, 1, 11);

  if (!rows.length) {
    ws.getCell('A18').value = t(locale, 'noData');
    return;
  }

  let r = 18;
  for (const x of rows) {
    const items = x.meta?.items;
    const qty = sumQtyFromItems(items);
    const unit = unitPriceFromItems(items, String(x.currency || baseCurrency));
    const fx = fxDisplay(x, baseCurrency);

    const isPurchase = String(x.type).toLowerCase() === 'purchase';
    const isPayment = String(x.type).toLowerCase() === 'payment';

    if (isPurchase) {
      ws.getRow(r).values = [
        x.businessDate,
        x.description ?? '',
        qty ?? '',
        unit ?? '',
        x.currency ?? '',
        fx ?? '',
        (typeof x.creditOrig === 'number' ? x.creditOrig : ''),
        '',
        '',
        '',
        '',
      ];
      ws.getCell(r, 1).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 4).numFmt = unit ? safeNumFmt(String(x.currency || baseCurrency)) : 'General';
      ws.getCell(r, 7).numFmt = safeNumFmt(String(x.currency || baseCurrency));
      ws.getCell(r, 6).numFmt = '0.########';
    } else if (isPayment) {
      ws.getRow(r).values = [
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        x.businessDate,
        x.currency ?? '',
        fx ?? '',
        (typeof x.debitOrig === 'number' ? x.debitOrig : ''),
      ];
      ws.getCell(r, 8).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 11).numFmt = safeNumFmt(String(x.currency || baseCurrency));
      ws.getCell(r, 10).numFmt = '0.########';
    } else {
      ws.getRow(r).values = [
        x.businessDate,
        x.description ?? '',
        '',
        '',
        x.currency ?? '',
        fx ?? '',
        '',
        '',
        '',
        '',
        '',
      ];
      ws.getCell(r, 1).numFmt = 'yyyy-mm-dd';
      ws.getCell(r, 6).numFmt = '0.########';
    }

    styleBodyRow(ws, r, 1, 11);
    r++;
  }
}

function buildProductSheet(ws: ExcelJS.Worksheet, summary: StatementSummary, rows: StatementRow[], locale?: string) {
  applyRTL(ws, locale);
  setSheetPrintDefaults(ws);

  // widths A..L
  const widths = [14, 40, 18, 14, 12, 16, 28, 14, 14, 16, 12, 28];
  for (let i = 1; i <= 12; i++) ws.getColumn(i).width = widths[i - 1];

  setBold(ws, 'B6', t(locale, 'company'), 16);

  // Product info: take from first row meta if present
  const meta0 = rows?.[0]?.meta || {};
  const productName = meta0.productName || entityNameFromLabel(summary.entityLabel);
  const productCode = meta0.productCode || '';
  const category = meta0.category || '';
  const cur = meta0.currency || '';

  const purchasePrice = (typeof meta0.purchasePrice === 'number' ? meta0.purchasePrice : null);
  const sellingPrice = (typeof meta0.sellingPrice === 'number' ? meta0.sellingPrice : null);
  const profit = (purchasePrice != null && sellingPrice != null) ? (sellingPrice - purchasePrice) : null;
  const remainingValue = (purchasePrice != null) ? (Number(summary.closingBase || 0) * purchasePrice) : null;

  setBold(ws, 'A12', t(locale, 'productStatment'), 12);
  setText(ws, 'B12', String(productName || ''));

  setBold(ws, 'A15', t(locale, 'dateRange', { from: iso(summary.periodFrom), to: iso(summary.periodTo) }));

  ws.getRow(16).values = [
    t(locale, 'h_date'),
    t(locale, 'h_description'),
    t(locale, 'h_productCode'),
    t(locale, 'h_category'),
    t(locale, 'h_currency'),
    t(locale, 'h_exchangeRate'),
    t(locale, 'h_balanceWas'),
    t(locale, 'h_qtyLeft'),
    t(locale, 'h_priceOrigin'),
    t(locale, 'h_sellingPrice'),
    t(locale, 'h_profit'),
    t(locale, 'h_remainingValue'),
  ];
  styleHeaderRow(ws, 16, 1, 12);

  // Row 17 summary line (matches template)
  ws.getRow(17).values = [
    summary.periodTo,
    String(productName || ''),
    String(productCode || ''),
    String(category || ''),
    String(cur || ''),
    '',
    summary.openingBase ?? 0,
    summary.closingBase ?? 0,
    purchasePrice ?? '',
    sellingPrice ?? '',
    profit ?? '',
    remainingValue ?? '',
  ];
  ws.getCell(17, 1).numFmt = 'yyyy-mm-dd';
  ws.getCell(17, 7).numFmt = '#,##0.00';
  ws.getCell(17, 8).numFmt = '#,##0.00';
  if (purchasePrice != null) ws.getCell(17, 9).numFmt = '#,##0.00';
  if (sellingPrice != null) ws.getCell(17, 10).numFmt = '#,##0.00';
  if (profit != null) ws.getCell(17, 11).numFmt = '#,##0.00';
  if (remainingValue != null) ws.getCell(17, 12).numFmt = '#,##0.00';
  styleBodyRow(ws, 17, 1, 12);
}

function buildSummarySheet(wb: ExcelJS.Workbook, summary: StatementSummary, baseCurrency: string, locale?: string) {
  const sh = wb.addWorksheet('Summary', { views: [{ showGridLines: false, rightToLeft: locale === 'ar' }] });
  sh.getColumn(1).width = 22;
  sh.getColumn(2).width = 46;
  sh.getColumn(3).width = 18;

  sh.mergeCells('A1:B1');
  sh.getCell('A1').value = summary.title;
  sh.getCell('A1').font = { name: 'Arial', size: 16, bold: true };

  sh.getCell('A2').value = t(locale, 'sum_exportVer', { v: '2026-02-10-v1' });

  sh.getCell('A3').value = t(locale, 'sum_entity');
  sh.getCell('B3').value = summary.entityLabel;

  sh.getCell('A4').value = t(locale, 'sum_period');
  sh.getCell('B4').value = `${iso(summary.periodFrom)} → ${iso(summary.periodTo)}`;

  sh.getCell('A5').value = t(locale, 'sum_base');
  sh.getCell('B5').value = String(summary.baseCurrency || baseCurrency);

  const fmt = safeNumFmt(String(baseCurrency));

  sh.getCell('A7').value = t(locale, 'sum_opening');
  sh.getCell('B7').value = summary.openingBase;
  sh.getCell('B7').numFmt = fmt;

  sh.getCell('A8').value = t(locale, 'sum_totalDebit');
  sh.getCell('B8').value = summary.totalDebitBase;
  sh.getCell('B8').numFmt = fmt;

  sh.getCell('A9').value = t(locale, 'sum_totalCredit');
  sh.getCell('B9').value = summary.totalCreditBase;
  sh.getCell('B9').numFmt = fmt;

  sh.getCell('A10').value = t(locale, 'sum_closing');
  sh.getCell('B10').value = summary.closingBase;
  sh.getCell('B10').numFmt = fmt;

  sh.getCell('A12').value = t(locale, 'sum_warnings');
  sh.getCell('B12').value = summary.warnings?.length ? summary.warnings.join('\n') : t(locale, 'dash');
  sh.getCell('B12').alignment = { wrapText: true };

  let r = 14;
  sh.getCell(`A${r}`).value = t(locale, 'sum_totalsByCur');
  sh.getCell(`A${r}`).font = { bold: true };
  r++;

  sh.getCell(`A${r}`).value = t(locale, 'sum_currency');
  sh.getCell(`B${r}`).value = t(locale, 'sum_debit');
  sh.getCell(`C${r}`).value = t(locale, 'sum_credit');
  sh.getRow(r).font = { bold: true };
  r++;

  Object.entries(summary.totalsByCurrencyOrig || {}).forEach(([cur, v]: any) => {
    sh.getCell(`A${r}`).value = cur;
    sh.getCell(`B${r}`).value = v.debit;
    sh.getCell(`C${r}`).value = v.credit;
    const f = safeNumFmt(cur);
    sh.getCell(`B${r}`).numFmt = f;
    sh.getCell(`C${r}`).numFmt = f;
    r++;
  });
}

export async function buildStatementWorkbook(params: {
  summary: StatementSummary;
  rows: StatementRow[];
  baseCurrency: string;
  locale?: string;
  statementType?: string;
}): Promise<Buffer> {
  const { summary, rows, baseCurrency, locale, statementType } = params;

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);
  
  (wb as any).views = [{
    x: 0,
    y: 0,
    width: 10000,
    height: 20000,
    firstSheet: 0,
    activeTab: 0,
    visibility: 'visible',
  }];

  const ws = wb.addWorksheet('Statement');

  // Build template-style statement
  if (statementType === 'expenses') {
    buildExpensesSheet(ws, summary, rows, baseCurrency, locale);
  } else if (statementType === 'client') {
    buildClientSheet(ws, summary, rows, baseCurrency, locale);
  } else if (statementType === 'supplier') {
    buildSupplierSheet(ws, summary, rows, baseCurrency, locale);
  } else if (statementType === 'productMovement') {
    buildProductSheet(ws, summary, rows, locale);
  } else {
    // fallback
    setBold(ws, 'B3', t(locale, 'company'), 16);
    setText(ws, 'B5', t(locale, 'noData'));
  }

  // Summary sheet
  buildSummarySheet(wb, summary, baseCurrency, locale);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
