// functions/src/exports/statement-engine.ts
import ExcelJS from 'exceljs';
import { StatementRow, StatementSummary, Currency } from './types';

type Labels = {
  companyTitle: string;
  statementSectionTitle: string;
  clientLabel: string;
  supplierLabel: string;
  expensesLabel: string;
  productLabel: string;
  currencyLabel: string;
  periodLabel: string;

  openingBalance: string;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  totalTransactions: string;

  // Table headers
  hDate: string;
  hDescription: string;
  hReference: string;
  hType: string;
  hDebit: string;
  hCredit: string;
  hRunning: string;

  // Special rows
  openingRow: string;
  totalRow: string;

  // Summary/Raw
  summarySheet: string;
  statementSheet: string;
  rawSheet: string;
  warnings: string;
  totalsByCurrency: string;
};

function getLabels(locale?: string): Labels {
  const lng = (locale || 'en').split('-')[0].toLowerCase();

  const en: Labels = {
    companyTitle: 'FlowVia Business Solutions',
    statementSectionTitle: 'Client Statement',
    clientLabel: 'Client:',
    supplierLabel: 'Supplier:',
    expensesLabel: 'Expenses:',
    productLabel: 'Product:',
    currencyLabel: 'Currency:',
    periodLabel: 'Period:',

    openingBalance: 'Opening Balance:',
    totalDebit: 'Total Debits:',
    totalCredit: 'Total Credits:',
    closingBalance: 'Closing Balance:',
    totalTransactions: 'Total Transactions:',

    hDate: 'Date',
    hDescription: 'Description',
    hReference: 'Reference',
    hType: 'Type',
    hDebit: 'Debit',
    hCredit: 'Credit',
    hRunning: 'Running Balance',

    openingRow: 'Opening Balance',
    totalRow: 'Total:',

    summarySheet: 'Summary',
    statementSheet: 'Client Statement',
    rawSheet: 'Raw Data',
    warnings: 'Warnings',
    totalsByCurrency: 'Totals by Currency (Original)',
  };

  const ru: Partial<Labels> = {
    statementSectionTitle: 'Выписка клиента',
    clientLabel: 'Клиент:',
    supplierLabel: 'Поставщик:',
    currencyLabel: 'Валюта:',
    periodLabel: 'Период:',
    openingBalance: 'Начальный остаток:',
    totalDebit: 'Итого дебет:',
    totalCredit: 'Итого кредит:',
    closingBalance: 'Конечный остаток:',
    totalTransactions: 'Всего операций:',
    hDate: 'Дата',
    hDescription: 'Описание',
    hReference: 'Ссылка',
    hType: 'Тип',
    hDebit: 'Дебет',
    hCredit: 'Кредит',
    hRunning: 'Остаток',
    openingRow: 'Начальный остаток',
    totalRow: 'Итого:',
    summarySheet: 'Сводка',
    statementSheet: 'Выписка',
    rawSheet: 'Исходные данные',
    warnings: 'Предупреждения',
    totalsByCurrency: 'Итоги по валютам (ориг.)',
  };

  const uz: Partial<Labels> = {
    statementSectionTitle: 'Mijoz hisoboti',
    clientLabel: 'Mijoz:',
    supplierLabel: 'Yetkazib beruvchi:',
    currencyLabel: 'Valyuta:',
    periodLabel: 'Davr:',
    openingBalance: 'Boshlang‘ich qoldiq:',
    totalDebit: 'Jami debit:',
    totalCredit: 'Jami kredit:',
    closingBalance: 'Yakuniy qoldiq:',
    totalTransactions: 'Operatsiyalar soni:',
    hDate: 'Sana',
    hDescription: 'Tavsif',
    hReference: 'Havola',
    hType: 'Turi',
    hDebit: 'Debit',
    hCredit: 'Kredit',
    hRunning: 'Qoldiq',
    openingRow: 'Boshlang‘ich qoldiq',
    totalRow: 'Jami:',
    summarySheet: 'Xulosa',
    statementSheet: 'Hisobot',
    rawSheet: 'Xom ma’lumot',
    warnings: 'Ogohlantirishlar',
    totalsByCurrency: 'Valyuta bo‘yicha (asl)',
  };

  const ar: Partial<Labels> = {
    statementSectionTitle: 'كشف العميل',
    clientLabel: 'العميل:',
    supplierLabel: 'المورد:',
    currencyLabel: 'العملة:',
    periodLabel: 'الفترة:',
    openingBalance: 'الرصيد الافتتاحي:',
    totalDebit: 'إجمالي المدين:',
    totalCredit: 'إجمالي الدائن:',
    closingBalance: 'الرصيد الختامي:',
    totalTransactions: 'عدد العمليات:',
    hDate: 'التاريخ',
    hDescription: 'الوصف',
    hReference: 'المرجع',
    hType: 'النوع',
    hDebit: 'مدين',
    hCredit: 'دائن',
    hRunning: 'الرصيد',
    openingRow: 'الرصيد الافتتاحي',
    totalRow: 'الإجمالي:',
    summarySheet: 'ملخص',
    statementSheet: 'كشف',
    rawSheet: 'بيانات خام',
    warnings: 'تنبيهات',
    totalsByCurrency: 'الإجمالي حسب العملة (أصلي)',
  };

  const map: Record<string, Partial<Labels>> = { en: {}, ru, uz, ar };
  return { ...en, ...(map[lng] || {}) };
}

function fmtYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function asDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isQtyCurrency(c: any): boolean {
  return String(c || '').toUpperCase() === 'QTY';
}

function setThinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
}

function applyRangeBorder(ws: ExcelJS.Worksheet, fromRow: number, toRow: number, fromCol: number, toCol: number) {
  for (let r = fromRow; r <= toRow; r++) {
    for (let c = fromCol; c <= toCol; c++) setThinBorder(ws.getCell(r, c));
  }
}

export async function buildStatementWorkbook(params: {
  summary: StatementSummary;
  rows: StatementRow[];
  baseCurrency: Currency;
  locale?: string;
}): Promise<Buffer> {
  const { summary, rows, baseCurrency, locale } = params;
  const L = getLabels(locale);

  // Colors (ARGB)
  const BLUE = 'FF1F4E79';
  const LIGHT_BLUE = 'FFE9F2FB';
  const GREY = 'FF6B7280';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FlowVia';
  wb.created = new Date();
  wb.modified = new Date();

  // Sheet names (match screenshot)
  const sheetSummary = wb.addWorksheet(L.summarySheet);
  const sheetStatement = wb.addWorksheet(L.statementSheet);
  const sheetRaw = wb.addWorksheet(L.rawSheet);

  // -------------------------------------------
  // STATEMENT SHEET (the screenshot layout)
  // -------------------------------------------
  // Column layout (leave column A as margin)
  sheetStatement.getColumn(1).width = 2;  // A
  sheetStatement.getColumn(2).width = 13; // B Date
  sheetStatement.getColumn(3).width = 32; // C Desc
  sheetStatement.getColumn(4).width = 14; // D Ref
  sheetStatement.getColumn(5).width = 12; // E Type
  sheetStatement.getColumn(6).width = 14; // F Debit
  sheetStatement.getColumn(7).width = 14; // G Credit
  sheetStatement.getColumn(8).width = 18; // H Running

  // Hide grid lines for cleaner “bank” look
  sheetStatement.views = [{ state: 'normal', showGridLines: false }];

  // Title
  sheetStatement.mergeCells('B2:H2');
  sheetStatement.getCell('B2').value = L.companyTitle;
  sheetStatement.getCell('B2').font = { name: 'Calibri', size: 14, bold: true };
  sheetStatement.getCell('B2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheetStatement.getRow(2).height = 22;

  // Subtitle = summary.title (or fallback)
  sheetStatement.mergeCells('B3:H3');
  sheetStatement.getCell('B3').value = summary.title || 'Statement';
  sheetStatement.getCell('B3').font = { name: 'Calibri', size: 11, bold: true, color: { argb: GREY } };
  sheetStatement.getCell('B3').alignment = { horizontal: 'center', vertical: 'middle' };
  sheetStatement.getRow(3).height = 18;

  // Client/Supplier/Product label line (uses summary.entityLabel)
  // Put it on row 5 as in screenshot
  const entityLabel = summary.entityLabel || '';
  sheetStatement.getCell('B5').value =
    entityLabel.toLowerCase().includes('supplier') ? L.supplierLabel :
    entityLabel.toLowerCase().includes('product') ? L.productLabel :
    entityLabel.toLowerCase().includes('expense') ? L.expensesLabel :
    L.clientLabel;
  sheetStatement.getCell('B5').font = { bold: true };
  sheetStatement.getCell('C5').value = entityLabel.replace(/^.*?:\s*/,''); // keep just name if you stored "Client: X"
  sheetStatement.getCell('C5').font = { bold: true };

  sheetStatement.getCell('B6').value = L.currencyLabel;
  sheetStatement.getCell('B6').font = { bold: true };
  sheetStatement.getCell('C6').value = String(baseCurrency);
  sheetStatement.getCell('C6').font = { bold: true };

  sheetStatement.getCell('B7').value = L.periodLabel;
  sheetStatement.getCell('B7').font = { bold: true };
  sheetStatement.getCell('C7').value = `From ${fmtYmd(summary.periodFrom)} to ${fmtYmd(summary.periodTo)}`;

  // Summary blue box (B9:C13)
  const isQty = isQtyCurrency(baseCurrency) || isQtyCurrency(summary.baseCurrency);
  const numFmtMoney = '#,##0.00;[Red]-#,##0.00;"-";@';
  const numFmtQty = '#,##0;[Red]-#,##0;"-";@';
  const fmt = isQty ? numFmtQty : numFmtMoney;

  const opening = Number(summary.openingBase ?? 0);
  const totalDebit = Number(summary.totalDebitBase ?? 0);
  const totalCredit = Number(summary.totalCreditBase ?? 0);
  const closing = Number(summary.closingBase ?? (opening + totalDebit - totalCredit));
  const txCount = Number(summary.txCount ?? rows.length);

  const box = [
    { label: L.openingBalance, value: opening },
    { label: L.totalDebit, value: totalDebit },
    { label: L.totalCredit, value: totalCredit },
    { label: L.closingBalance, value: closing },
    { label: L.totalTransactions, value: txCount },
  ];

  const boxStartRow = 9;
  for (let i = 0; i < box.length; i++) {
    const r = boxStartRow + i;

    // Label (blue)
    const cLabel = sheetStatement.getCell(r, 2); // B
    cLabel.value = box[i].label;
    cLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cLabel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cLabel.alignment = { horizontal: 'left', vertical: 'middle' };

    // Value (white)
    const cVal = sheetStatement.getCell(r, 3); // C
    cVal.value = box[i].value;
    cVal.font = { bold: true };
    cVal.alignment = { horizontal: 'right', vertical: 'middle' };

    if (i < 4) {
      cVal.numFmt = fmt;
    } else {
      cVal.numFmt = '#,##0';
    }
  }
  // Border around the box
  applyRangeBorder(sheetStatement, boxStartRow, boxStartRow + box.length - 1, 2, 3);

  // Section title
  const sectionRow = 15;
  sheetStatement.mergeCells(`B${sectionRow}:H${sectionRow}`);
  sheetStatement.getCell(`B${sectionRow}`).value = L.statementSectionTitle;
  sheetStatement.getCell(`B${sectionRow}`).font = { bold: true };
  sheetStatement.getCell(`B${sectionRow}`).alignment = { horizontal: 'left' };

  // Table header
  const headerRow = 16;
  const headers = [L.hDate, L.hDescription, L.hReference, L.hType, L.hDebit, L.hCredit, L.hRunning];
  for (let i = 0; i < headers.length; i++) {
    const cell = sheetStatement.getCell(headerRow, 2 + i); // B..H
    cell.value = headers[i];
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setThinBorder(cell);
  }
  sheetStatement.getRow(headerRow).height = 18;

  // AutoFilter like screenshot
  sheetStatement.autoFilter = {
    from: { row: headerRow, column: 2 },
    to: { row: headerRow, column: 8 },
  };

  // Freeze top area including header
  sheetStatement.views = [{
    state: 'frozen',
    ySplit: headerRow,     // rows 1..16 frozen
    xSplit: 0,
    showGridLines: false,
  }];

  // Build running balance safely (fixes 0-doc issues)
  const sorted = [...rows]
    .map(r => ({ ...r, businessDate: asDate((r as any).businessDate) || asDate((r as any).date) || summary.periodFrom }))
    .sort((a, b) => (a.businessDate as any).getTime() - (b.businessDate as any).getTime());

  let running = opening;
  let sumDebit = 0;
  let sumCredit = 0;

  let writeRow = headerRow + 1;

  // Opening row (always present, even if 0 docs)
  {
    const openingDate = new Date(summary.periodFrom);
    openingDate.setDate(openingDate.getDate() - 1);

    // For screenshot-like display: Opening amount shown in Debit if positive, else Credit
    const openDebit = opening >= 0 ? opening : 0;
    const openCredit = opening < 0 ? Math.abs(opening) : 0;

    const rowCells = [
      openingDate,                 // Date
      L.openingRow,                // Desc
      '',                          // Ref
      '',                          // Type
      openDebit,                   // Debit
      openCredit,                  // Credit
      opening,                     // Running
    ];

    for (let i = 0; i < rowCells.length; i++) {
      const cell = sheetStatement.getCell(writeRow, 2 + i);
      cell.value = rowCells[i] as any;
      cell.alignment = { vertical: 'middle', horizontal: i === 1 ? 'left' : 'center' };
      setThinBorder(cell);

      if (i === 0) cell.numFmt = 'yyyy-mm-dd';
      if (i >= 4 && i <= 6) {
        cell.numFmt = i === 6 ? (isQty ? '#,##0' : '#,##0.00') : fmt; // running shows 0 as 0 (not "-")
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      }
    }
    writeRow++;
  }

  // Transaction rows
  for (const r of sorted) {
    const debit = Number((r as any).debitBase ?? 0);
    const credit = Number((r as any).creditBase ?? 0);
    running = running + debit - credit;

    sumDebit += debit;
    sumCredit += credit;

    const d = asDate((r as any).businessDate) || summary.periodFrom;

    const rowCells = [
      d,
      (r as any).description || '',
      (r as any).reference || '',
      String((r as any).type || ''),
      debit,
      credit,
      running,
    ];

    for (let i = 0; i < rowCells.length; i++) {
      const cell = sheetStatement.getCell(writeRow, 2 + i);
      cell.value = rowCells[i] as any;
      setThinBorder(cell);

      if (i === 0) {
        cell.numFmt = 'yyyy-mm-dd';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (i >= 4 && i <= 6) {
        cell.numFmt = i === 6 ? (isQty ? '#,##0' : '#,##0.00') : fmt;
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    }

    // light zebra shading (optional, matches "bank feel")
    if ((writeRow - (headerRow + 1)) % 2 === 0) {
      for (let c = 2; c <= 8; c++) {
        sheetStatement.getCell(writeRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
      }
    }

    writeRow++;
  }

  // Totals row (no formulas => fixes broken ranges when 0 docs)
  {
    const totalsRow = writeRow;
    const labelCell = sheetStatement.getCell(totalsRow, 2); // B
    labelCell.value = L.totalRow;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

    // Put totals in Debit/Credit/Running columns
    const debitCell = sheetStatement.getCell(totalsRow, 6); // F
    const creditCell = sheetStatement.getCell(totalsRow, 7); // G
    const runningCell = sheetStatement.getCell(totalsRow, 8); // H

    debitCell.value = sumDebit;
    creditCell.value = sumCredit;
    runningCell.value = running;

    debitCell.numFmt = fmt;
    creditCell.numFmt = fmt;
    runningCell.numFmt = isQty ? '#,##0' : '#,##0.00';

    debitCell.font = { bold: true };
    creditCell.font = { bold: true };
    runningCell.font = { bold: true };

    debitCell.alignment = { horizontal: 'right', vertical: 'middle' };
    creditCell.alignment = { horizontal: 'right', vertical: 'middle' };
    runningCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // Border across table width + top border feel
    for (let c = 2; c <= 8; c++) {
      const cell = sheetStatement.getCell(totalsRow, c);
      setThinBorder(cell);
      cell.font = { ...(cell.font || {}), bold: true };
    }
  }

  // Border around the whole statement table area
  applyRangeBorder(sheetStatement, headerRow, writeRow, 2, 8);

  // -------------------------------------------
  // SUMMARY SHEET (simple & audit-friendly)
  // -------------------------------------------
  sheetSummary.getColumn(1).width = 2;
  sheetSummary.getColumn(2).width = 40;
  sheetSummary.getColumn(3).width = 22;

  sheetSummary.mergeCells('B2:C2');
  sheetSummary.getCell('B2').value = summary.title || 'Statement';
  sheetSummary.getCell('B2').font = { size: 14, bold: true };
  sheetSummary.getCell('B2').alignment = { horizontal: 'left' };

  sheetSummary.getCell('B4').value = summary.entityLabel || '';
  sheetSummary.getCell('B4').font = { bold: true };

  sheetSummary.getCell('B5').value = `${L.periodLabel} From ${fmtYmd(summary.periodFrom)} to ${fmtYmd(summary.periodTo)}`;
  sheetSummary.getCell('B6').value = `${L.currencyLabel} ${String(baseCurrency)}`;

  // Totals
  const sRows = [
    [L.openingBalance, opening],
    [L.totalDebit, totalDebit],
    [L.totalCredit, totalCredit],
    [L.closingBalance, closing],
    [L.totalTransactions, txCount],
  ];
  let sr = 8;
  for (const [k, v] of sRows) {
    sheetSummary.getCell(sr, 2).value = k;
    sheetSummary.getCell(sr, 2).font = { bold: true };
    sheetSummary.getCell(sr, 3).value = v as any;
    sheetSummary.getCell(sr, 3).alignment = { horizontal: 'right' };
    if (k !== L.totalTransactions) sheetSummary.getCell(sr, 3).numFmt = fmt;
    sr++;
  }

  // Totals by currency (original)
  sr += 1;
  sheetSummary.getCell(sr, 2).value = L.totalsByCurrency;
  sheetSummary.getCell(sr, 2).font = { bold: true };
  sr++;

  const totalsByCurrencyOrig = (summary as any).totalsByCurrencyOrig || {};
  const currencies = Object.keys(totalsByCurrencyOrig);
  if (currencies.length) {
    sheetSummary.getCell(sr, 2).value = 'Currency';
    sheetSummary.getCell(sr, 3).value = 'Debit / Credit';
    sheetSummary.getCell(sr, 2).font = { bold: true };
    sheetSummary.getCell(sr, 3).font = { bold: true };
    sr++;

    for (const cur of currencies) {
      const t = totalsByCurrencyOrig[cur];
      sheetSummary.getCell(sr, 2).value = cur;
      sheetSummary.getCell(sr, 3).value = `${Number(t.debit || 0).toFixed(2)} / ${Number(t.credit || 0).toFixed(2)}`;
      sr++;
    }
  } else {
    sheetSummary.getCell(sr, 2).value = '-';
    sr++;
  }

  // Warnings
  sr += 1;
  sheetSummary.getCell(sr, 2).value = L.warnings;
  sheetSummary.getCell(sr, 2).font = { bold: true };
  sr++;

  const warnings = (summary.warnings || []).filter(Boolean);
  if (warnings.length) {
    for (const w of warnings) {
      sheetSummary.getCell(sr, 2).value = `• ${w}`;
      sr++;
    }
  } else {
    sheetSummary.getCell(sr, 2).value = '-';
  }

  // -------------------------------------------
  // RAW DATA SHEET (full details, multi-currency, FX)
  // -------------------------------------------
  sheetRaw.views = [{ state: 'normal', showGridLines: false }];
  sheetRaw.columns = [
    { header: 'businessDate', key: 'businessDate', width: 16 },
    { header: 'description', key: 'description', width: 40 },
    { header: 'reference', key: 'reference', width: 18 },
    { header: 'type', key: 'type', width: 14 },
    { header: 'currency', key: 'currency', width: 10 },
    { header: 'debitOrig', key: 'debitOrig', width: 14 },
    { header: 'creditOrig', key: 'creditOrig', width: 14 },
    { header: 'fxRateToBase', key: 'fxRateToBase', width: 14 },
    { header: 'fxAsOf', key: 'fxAsOf', width: 18 },
    { header: 'fxStatus', key: 'fxStatus', width: 10 },
    { header: 'debitBase', key: 'debitBase', width: 14 },
    { header: 'creditBase', key: 'creditBase', width: 14 },
    { header: 'runningBase', key: 'runningBase', width: 14 },
  ];

  // Header style
  for (let c = 1; c <= sheetRaw.columnCount; c++) {
    const cell = sheetRaw.getCell(1, c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    setThinBorder(cell);
  }

  // Rows
  let rr = 2;
  for (const r of sorted) {
    const d = asDate((r as any).businessDate) || summary.periodFrom;
    const row = {
      businessDate: d,
      description: (r as any).description || '',
      reference: (r as any).reference || '',
      type: String((r as any).type || ''),
      currency: String((r as any).currency || baseCurrency || ''),
      debitOrig: Number((r as any).debitOrig ?? 0),
      creditOrig: Number((r as any).creditOrig ?? 0),
      fxRateToBase: (r as any).fxRateToBase ?? null,
      fxAsOf: asDate((r as any).fxAsOf),
      fxStatus: (r as any).fxStatus ?? '',
      debitBase: Number((r as any).debitBase ?? 0),
      creditBase: Number((r as any).creditBase ?? 0),
      runningBase: Number((r as any).runningBase ?? 0),
    };

    sheetRaw.addRow(row);
    // Style date + numbers
    sheetRaw.getCell(rr, 1).numFmt = 'yyyy-mm-dd';
    for (const col of [6, 7, 11, 12, 13]) {
      sheetRaw.getCell(rr, col).numFmt = isQty ? '#,##0' : '#,##0.00';
      sheetRaw.getCell(rr, col).alignment = { horizontal: 'right' };
    }
    for (let c = 1; c <= sheetRaw.columnCount; c++) setThinBorder(sheetRaw.getCell(rr, c));
    rr++;
  }

  sheetRaw.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheetRaw.columnCount },
  };
  sheetRaw.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];

  // Return
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
