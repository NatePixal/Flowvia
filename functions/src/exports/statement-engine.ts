// functions/src/exports/statement-engine.ts
import * as ExcelJS from 'exceljs';
import { StatementRow, StatementSummary, StatementCurrency } from './types';
import { excelNumFmtForCurrency } from './money';

function safeNumFmt(currency: StatementCurrency): string {
  // Quantity statements (no currency)
  if (currency === 'QTY') return '#,##0.00';

  try {
    const fmt = excelNumFmtForCurrency(currency as any);
    return fmt || '#,##0.00';
  } catch {
    return '#,##0.00';
  }
}

export async function buildStatementWorkbook(params: {
  summary: StatementSummary;
  rows: StatementRow[];
  baseCurrency: StatementCurrency;
}): Promise<Buffer> {
  const { summary, rows, baseCurrency } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FlowVia';
  wb.created = new Date();

  // ===== Summary sheet =====
  const shSummary = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });

  shSummary.columns = [
    { header: '', key: 'k', width: 22 },
    { header: '', key: 'v', width: 40 },
    { header: '', key: 'k2', width: 18 },
    { header: '', key: 'v2', width: 24 },
  ];

  shSummary.mergeCells('A1:D1');
  shSummary.getCell('A1').value = summary.title;
  shSummary.getCell('A1').font = { size: 16, bold: true };

  shSummary.getCell('A3').value = 'Entity';
  shSummary.getCell('B3').value = summary.entityLabel;

  shSummary.getCell('A4').value = 'Period';
  shSummary.getCell('B4').value = `${summary.periodFrom.toISOString().slice(0, 10)} → ${summary.periodTo
    .toISOString()
    .slice(0, 10)}`;

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
  shSummary.getCell('B12').value = summary.warnings.length ? summary.warnings.join('\n') : '—';
  shSummary.getCell('B12').alignment = { wrapText: true };

  // Totals by original currency
  let rowStart = 14;
  shSummary.getCell(`A${rowStart}`).value = 'Totals by currency (original)';
  shSummary.getCell(`A${rowStart}`).font = { bold: true };
  rowStart++;

  shSummary.getCell(`A${rowStart}`).value = 'Currency';
  shSummary.getCell(`B${rowStart}`).value = 'Debit';
  shSummary.getCell(`C${rowStart}`).value = 'Credit';
  shSummary.getRow(rowStart).font = { bold: true };
  rowStart++;

  Object.entries(summary.totalsByCurrencyOrig || {}).forEach(([cur, t]) => {
    shSummary.getCell(`A${rowStart}`).value = cur;
    shSummary.getCell(`B${rowStart}`).value = t.debit;
    shSummary.getCell(`C${rowStart}`).value = t.credit;

    const fmt = safeNumFmt(cur as any);
    shSummary.getCell(`B${rowStart}`).numFmt = fmt;
    shSummary.getCell(`C${rowStart}`).numFmt = fmt;

    rowStart++;
  });

  // ===== Rows sheet =====
  const sh = wb.addWorksheet('Statement', { views: [{ state: 'frozen', ySplit: 1 }] });
  sh.columns = [
    { header: 'Business Date', key: 'date', width: 14 },
    { header: 'Description', key: 'desc', width: 40 },
    { header: 'Reference', key: 'ref', width: 18 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Currency', key: 'cur', width: 10 },
    { header: 'FX As-Of', key: 'fxAsOf', width: 14 },
    { header: 'FX Rate', key: 'fxRate', width: 12 },
    { header: 'Debit (Orig)', key: 'debitOrig', width: 14 },
    { header: 'Credit (Orig)', key: 'creditOrig', width: 14 },
    { header: `Debit (${baseCurrency})`, key: 'debitBase', width: 16 },
    { header: `Credit (${baseCurrency})`, key: 'creditBase', width: 16 },
    { header: `Running (${baseCurrency})`, key: 'running', width: 18 },
  ];

  sh.getRow(1).font = { bold: true };

  rows.forEach((r) => {
    sh.addRow({
      date: r.businessDate ? r.businessDate.toISOString().slice(0, 10) : '',
      desc: r.description,
      ref: r.reference,
      type: r.type,
      cur: r.currency,
      fxAsOf: r.fxAsOf ? r.fxAsOf.toISOString().slice(0, 10) : '',
      fxRate: r.fxStatus === 'MISSING' ? 'FX MISSING' : r.fxRateToBase ?? '',
      debitOrig: r.debitOrig,
      creditOrig: r.creditOrig,
      debitBase: r.debitBase,
      creditBase: r.creditBase,
      running: r.runningBase,
    });
  });

  // Apply formats
  for (let i = 2; i <= sh.rowCount; i++) {
    const row = rows[i - 2];
    const fmtOrig = safeNumFmt(row.currency);
    sh.getCell(i, 8).numFmt = fmtOrig;
    sh.getCell(i, 9).numFmt = fmtOrig;

    sh.getCell(i, 10).numFmt = baseFmt;
    sh.getCell(i, 11).numFmt = baseFmt;
    sh.getCell(i, 12).numFmt = baseFmt;
  }

  sh.autoFilter = { from: 'A1', to: 'L1' };

  const totalsRowIndex = sh.rowCount + 2;
  sh.getCell(`G${totalsRowIndex}`).value = 'TOTALS';
  sh.getCell(`G${totalsRowIndex}`).font = { bold: true };

  sh.getCell(totalsRowIndex, 10).value = { formula: `SUM(J2:J${totalsRowIndex - 2})` };
  sh.getCell(totalsRowIndex, 11).value = { formula: `SUM(K2:K${totalsRowIndex - 2})` };
  sh.getCell(totalsRowIndex, 12).value = { formula: `L${totalsRowIndex - 1}` };

  sh.getCell(totalsRowIndex, 10).numFmt = baseFmt;
  sh.getCell(totalsRowIndex, 11).numFmt = baseFmt;
  sh.getCell(totalsRowIndex, 12).numFmt = baseFmt;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as any);
}
