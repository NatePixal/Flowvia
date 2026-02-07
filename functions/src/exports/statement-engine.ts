// functions/src/exports/statement-engine.ts
const ExcelJS = require('exceljs');
import { excelNumFmtForCurrency } from './money';

type AnyRow = Record<string, any>;

function safeNumFmt(currency: string) {
  if (currency === 'QTY') return '#,##0.00';
  try {
    return excelNumFmtForCurrency(currency) || '#,##0.00';
  } catch {
    return '#,##0.00';
  }
}

function isoDate(d?: Date | null) {
  if (!d) return null;
  return d; // return Date object so Excel treats it as a date
}

function text(v: any) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

function autoWidth(ws: any, max = 60) {
  ws.columns.forEach((col: any) => {
    let w = col.width || 10;
    col.eachCell({ includeEmpty: false }, (cell: any) => {
      const val = cell.value;
      const len = typeof val === 'string' ? val.length : (val?.richText ? 20 : 12);
      w = Math.max(w, Math.min(max, len + 2));
    });
    col.width = Math.max(col.width || 10, Math.min(max, w));
  });
}

function styleHeader(ws: any) {
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  r.height = 20;

  r.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };
  });
}

function styleRow(ws: any, rowIndex: number) {
  const r = ws.getRow(rowIndex);
  r.alignment = { vertical: 'top', wrapText: true };
  r.eachCell((cell: any) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      left: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
    };
  });
}

function markFxMissing(ws: any, rowIndex: number, colIndexes: number[]) {
  colIndexes.forEach((c) => {
    const cell = ws.getCell(rowIndex, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // light red
    cell.font = { color: { argb: 'FF991B1B' } };
  });
}

function getExpenseColumns(baseCurrency: string) {
  return [
    { header: 'Date', key: 'businessDate', width: 12, kind: 'date' },
    { header: 'Category', key: 'category', width: 16, kind: 'text' },
    { header: 'Description', key: 'description', width: 40, kind: 'text' },
    { header: 'Amount', key: 'amountOrig', width: 14, kind: 'moneyOrig' },
    { header: 'Currency', key: 'currency', width: 10, kind: 'text' },
    { header: 'FX Pair', key: 'fxPair', width: 12, kind: 'text' },
    { header: 'Entered Rate', key: 'fxEnteredRate', width: 14, kind: 'number' },
    { header: 'Rate To Base', key: 'fxRateToBase', width: 14, kind: 'number' },
    { header: `Amount (${baseCurrency})`, key: 'amountBase', width: 16, kind: 'moneyBase' },
    { header: 'Paid To', key: 'paidTo', width: 22, kind: 'text' },
    { header: 'Employee', key: 'employee', width: 18, kind: 'text' },
    { header: 'Created By', key: 'createdBy', width: 20, kind: 'text' },
    { header: 'Reference', key: 'reference', width: 22, kind: 'text' },
    { header: 'FX Status', key: 'fxStatus', width: 12, kind: 'text' },
  ];
}

function getLedgerColumns(baseCurrency: string) {
  return [
    { header: 'Business Date', key: 'businessDate', width: 12, kind: 'date' },
    { header: 'Description', key: 'description', width: 40, kind: 'text' },
    { header: 'Type', key: 'type', width: 12, kind: 'text' },
    { header: 'Currency', key: 'currency', width: 10, kind: 'text' },
    { header: 'FX As-Of', key: 'fxAsOf', width: 12, kind: 'date' },
    { header: 'FX Rate', key: 'fxRateToBase', width: 12, kind: 'number' },
    { header: 'Debit (Orig)', key: 'debitOrig', width: 14, kind: 'moneyOrig' },
    { header: 'Credit (Orig)', key: 'creditOrig', width: 14, kind: 'moneyOrig' },
    { header: `Debit (${baseCurrency})`, key: 'debitBase', width: 16, kind: 'moneyBase' },
    { header: `Credit (${baseCurrency})`, key: 'creditBase', width: 16, kind: 'moneyBase' },
    { header: `Running (${baseCurrency})`, key: 'runningBase', width: 18, kind: 'moneyBase' },
    { header: 'Reference', key: 'reference', width: 22, kind: 'text' },
    { header: 'FX Status', key: 'fxStatus', width: 12, kind: 'text' },
  ];
}

function getProductColumns() {
  return [
    { header: 'Date', key: 'businessDate', width: 12, kind: 'date' },
    { header: 'Description', key: 'description', width: 40, kind: 'text' },
    { header: 'Type', key: 'type', width: 12, kind: 'text' },
    { header: 'Qty In', key: 'debitOrig', width: 12, kind: 'qty' },
    { header: 'Qty Out', key: 'creditOrig', width: 12, kind: 'qty' },
    { header: 'Running Qty', key: 'runningBase', width: 14, kind: 'qty' },
    { header: 'Reference', key: 'reference', width: 22, kind: 'text' },
  ];
}

export async function buildStatementWorkbook(params: {
  summary: any;
  rows: AnyRow[];
  baseCurrency: string;
  locale?: string;
  statementType?: string; // NEW
}) {
  const { summary, rows, baseCurrency, statementType } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FlowVia';
  wb.created = new Date();

  // ===== Summary sheet (keep yours, only small polish) =====
  const shSummary = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  shSummary.columns = [
    { header: '', key: 'k', width: 22 },
    { header: '', key: 'v', width: 46 },
  ];

  shSummary.mergeCells('A1:B1');
  shSummary.getCell('A1').value = summary.title;
  shSummary.getCell('A1').font = { size: 16, bold: true };

  shSummary.getCell('A3').value = 'Entity';
  shSummary.getCell('B3').value = summary.entityLabel;

  shSummary.getCell('A4').value = 'Period';
  shSummary.getCell('B4').value =
    `${summary.periodFrom.toISOString().slice(0, 10)} → ${summary.periodTo.toISOString().slice(0, 10)}`;

  shSummary.getCell('A5').value = 'Base Currency';
  shSummary.getCell('B5').value = String(summary.baseCurrency);

  const baseFmt = safeNumFmt(baseCurrency);

  shSummary.getCell('A7').value = 'Opening';
  shSummary.getCell('B7').value = summary.openingBase;
  shSummary.getCell('B7').numFmt = baseFmt;

  shSummary.getCell('A8').value = 'Total Debit';
  shSummary.getCell('B8').value = summary.totalDebitBase;
  shSummary.getCell('B8').numFmt = baseFmt;

  shSummary.getCell('A9').value = 'Total Credit';
  shSummary.getCell('B9').value = summary.totalCreditBase;
  shSummary.getCell('B9').numFmt = baseFmt;

  shSummary.getCell('A10').value = 'Closing';
  shSummary.getCell('B10').value = summary.closingBase;
  shSummary.getCell('B10').numFmt = baseFmt;

  shSummary.getCell('A12').value = 'Warnings';
  shSummary.getCell('B12').value = summary.warnings?.length ? summary.warnings.join('\n') : '—';
  shSummary.getCell('B12').alignment = { wrapText: true };

  // Totals by original currency
  let r0 = 14;
  shSummary.getCell(`A${r0}`).value = 'Totals by currency (original)';
  shSummary.getCell(`A${r0}`).font = { bold: true };
  r0++;

  shSummary.getCell(`A${r0}`).value = 'Currency';
  shSummary.getCell(`B${r0}`).value = 'Debit';
  shSummary.getCell(`C${r0}`).value = 'Credit';
  shSummary.getRow(r0).font = { bold: true };
  r0++;

  Object.entries(summary.totalsByCurrencyOrig || {}).forEach(([cur, t]: any) => {
    shSummary.getCell(`A${r0}`).value = cur;
    shSummary.getCell(`B${r0}`).value = t.debit;
    shSummary.getCell(`C${r0}`).value = t.credit;
    const fmt = safeNumFmt(cur);
    shSummary.getCell(`B${r0}`).numFmt = fmt;
    shSummary.getCell(`C${r0}`).numFmt = fmt;
    r0++;
  });

  // ===== Statement sheet (report-aware) =====
  const sh = wb.addWorksheet('Statement', { views: [{ state: 'frozen', ySplit: 1 }] });

  const report = statementType || 'ledger';
  const cols =
    report === 'expenses'
      ? getExpenseColumns(baseCurrency)
      : report === 'productMovement'
        ? getProductColumns()
        : getLedgerColumns(baseCurrency);

  sh.columns = cols.map(c => ({ header: c.header, key: c.key, width: c.width }));

  styleHeader(sh);

  // Print-friendly
  sh.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9, // A4
    showGridLines: false,
    horizontalCentered: true,
  };

  const baseMoneyFmt = safeNumFmt(baseCurrency);

  rows.forEach((r, idx) => {
    // Normalize values for expense-friendly sheet
    const amountOrig = (r.amountOrig ?? ((r.debitOrig || 0) - (r.creditOrig || 0))) || 0;
    const amountBase = (r.amountBase ?? ((r.debitBase || 0) - (r.creditBase || 0))) || 0;

    const rowObj: AnyRow = {
      businessDate: isoDate(r.businessDate),
      fxAsOf: isoDate(r.fxAsOf),
      description: text(r.description),
      type: text(r.type),
      reference: text(r.reference),

      currency: text(r.currency),

      debitOrig: r.debitOrig ?? null,
      creditOrig: r.creditOrig ?? null,
      debitBase: r.debitBase ?? null,
      creditBase: r.creditBase ?? null,
      runningBase: r.runningBase ?? null,

      // Expense-specific fields (will be ignored by ledger sheet)
      category: text(r.category ?? r.meta?.category ?? r.meta?.expenseType),
      paidTo: text(r.paidTo ?? r.meta?.paidTo ?? r.meta?.paid_to_seller_name ?? r.meta?.vendor ?? r.meta?.payee),
      employee: text(r.employee ?? r.meta?.employee ?? r.meta?.employee_name),
      createdBy: text(r.createdBy ?? r.meta?.createdBy ?? r.meta?.createdByUid),
      fxPair: text(r.fxPair ?? r.meta?.fxPair ?? r.meta?.enteredPair),
      fxEnteredRate: r.fxEnteredRate ?? r.meta?.fxEnteredRate ?? r.meta?.enteredRate ?? null,
      fxRateToBase: r.fxRateToBase ?? null,
      fxStatus: text(r.fxStatus ?? 'OK'),
      amountOrig,
      amountBase,
    };

    const added = sh.addRow(rowObj);

    // Styling
    const excelRow = added.number;
    styleRow(sh, excelRow);

    // Formats per row
    cols.forEach((c, i) => {
      const colIndex = i + 1;

      if (c.kind === 'date') {
        sh.getCell(excelRow, colIndex).numFmt = 'yyyy-mm-dd';
      }

      if (c.kind === 'moneyOrig') {
        const fmt = safeNumFmt(r.currency || baseCurrency);
        sh.getCell(excelRow, colIndex).numFmt = fmt;
      }

      if (c.kind === 'moneyBase') {
        sh.getCell(excelRow, colIndex).numFmt = baseMoneyFmt;
      }

      if (c.kind === 'qty') {
        sh.getCell(excelRow, colIndex).numFmt = '#,##0.00';
      }

      if (c.kind === 'number') {
        sh.getCell(excelRow, colIndex).numFmt = '0.########';
      }
    });

    // Highlight FX missing rows
    if (String(r.fxStatus) === 'MISSING') {
      const fxCols = cols
        .map((c, i) => ({ c, i: i + 1 }))
        .filter(x => ['fxEnteredRate', 'fxRateToBase', 'amountBase', 'debitBase', 'creditBase', 'runningBase'].includes(x.c.key))
        .map(x => x.i);

      markFxMissing(sh, excelRow, fxCols);
    }
  });

  // Filter + autosize
  sh.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cols.length },
  };

  autoWidth(sh);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as any);
}
