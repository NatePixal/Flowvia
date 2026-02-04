// functions/src/exports/statement-engine.ts
import * as ExcelJS from 'exceljs';
import { StatementRow, StatementSummary } from './types';
import { excelNumFmtForCurrency } from './money';

type BuildWorkbookParams = {
  summary: StatementSummary;
  rows: StatementRow[];
  baseCurrency: string;
};

export async function buildStatementWorkbook(params: BuildWorkbookParams): Promise<Buffer> {
  const { summary, rows, baseCurrency } = params;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FlowVia';
  wb.created = new Date();

  // ===== Sheet 1: Summary =====
  const shSummary = wb.addWorksheet('Summary');

  shSummary.columns = [
    { width: 26 },
    { width: 70 },
  ];

  const writeKV = (r: number, k: string, v: any) => {
    shSummary.getCell(`A${r}`).value = k;
    shSummary.getCell(`A${r}`).font = { bold: true };
    shSummary.getCell(`B${r}`).value = v;
  };

  writeKV(1, 'Report', summary.title);
  writeKV(2, 'CompanyId', summary.companyId);
  writeKV(3, 'Entity', summary.entityLabel);
  writeKV(4, 'Period', `${fmtDate(summary.periodFrom)} → ${fmtDate(summary.periodTo)}`);
  writeKV(5, 'Base Currency', summary.baseCurrency);

  writeKV(7, 'Opening Balance (Base)', summary.openingBase);
  writeKV(8, 'Total Debit (Base)', summary.totalDebitBase);
  writeKV(9, 'Total Credit (Base)', summary.totalCreditBase);
  writeKV(10, 'Closing Balance (Base)', summary.closingBase);

  writeKV(12, 'Transactions', summary.txCount);

  // Base number formats
  const baseFmt = excelNumFmtForCurrency(baseCurrency);
  ['B7', 'B8', 'B9', 'B10'].forEach((addr) => {
    shSummary.getCell(addr).numFmt = baseFmt;
  });

  // Warnings
  shSummary.getCell('A14').value = 'Warnings';
  shSummary.getCell('A14').font = { bold: true };
  if (summary.warnings.length === 0) {
    shSummary.getCell('B14').value = 'None';
  } else {
    shSummary.getCell('B14').value = summary.warnings.join(' | ');
  }

  // Totals by original currency
  shSummary.getCell('A16').value = 'Totals by Currency (Original)';
  shSummary.getCell('A16').font = { bold: true };

  shSummary.getRow(17).values = ['Currency', 'Debit (Orig)', 'Credit (Orig)'];
  shSummary.getRow(17).font = { bold: true };

  shSummary.columns = [
    { width: 26 },
    { width: 26 },
    { width: 26 },
    { width: 26 },
  ];

  let r = 18;
  for (const [cur, totals] of Object.entries(summary.totalsByCurrencyOrig)) {
    shSummary.getCell(`A${r}`).value = cur;
    shSummary.getCell(`B${r}`).value = totals.debit;
    shSummary.getCell(`C${r}`).value = totals.credit;

    // Use that currency format for orig totals
    const fmt = excelNumFmtForCurrency(cur);
    shSummary.getCell(`B${r}`).numFmt = fmt;
    shSummary.getCell(`C${r}`).numFmt = fmt;
    r++;
  }

  // ===== Sheet 2: Statement =====
  const sh = wb.addWorksheet('Statement');

  sh.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Description', key: 'desc', width: 44 },
    { header: 'Reference', key: 'ref', width: 26 },
    { header: 'Type', key: 'type', width: 14 },

    { header: 'Currency', key: 'cur', width: 10 },
    { header: 'FX As-Of Date', key: 'fxAsOf', width: 12 },
    { header: 'FX Rate To Base', key: 'fxRate', width: 16 },

    { header: 'Debit (Orig)', key: 'debitO', width: 16 },
    { header: 'Credit (Orig)', key: 'creditO', width: 16 },

    { header: 'Debit (Base)', key: 'debitB', width: 16 },
    { header: 'Credit (Base)', key: 'creditB', width: 16 },
    { header: 'Running Balance (Base)', key: 'runB', width: 22 },
  ];

  // Header styling
  const headerRow = sh.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 18;

  // Freeze + filter
  sh.views = [{ state: 'frozen', ySplit: 1 }];
  sh.autoFilter = {
    from: 'A1',
    to: 'L1',
  };

  // Fill rows
  rows.forEach((x) => {
    sh.addRow({
      date: x.businessDate,
      desc: x.description,
      ref: x.reference,
      type: x.type,

      cur: x.currency,
      fxAsOf: x.fxAsOf ?? null,
      fxRate: x.fxRateToBase ?? null,

      debitO: x.debitOrig,
      creditO: x.creditOrig,

      debitB: x.debitBase,
      creditB: x.creditBase,
      runB: x.runningBase,
    });
  });

  // Formats per column
  sh.getColumn('date').numFmt = 'yyyy-mm-dd';
  sh.getColumn('fxAsOf').numFmt = 'yyyy-mm-dd';
  sh.getColumn('fxRate').numFmt = '#,##0.000000';

  // Base columns use base fmt
  sh.getColumn('debitB').numFmt = baseFmt;
  sh.getColumn('creditB').numFmt = baseFmt;
  sh.getColumn('runB').numFmt = baseFmt;

  // Orig columns must vary per row currency → we apply cell formatting row-by-row
  for (let i = 2; i <= rows.length + 1; i++) {
    const row = rows[i - 2];
    const fmtOrig = excelNumFmtForCurrency(row.currency);

    sh.getCell(`H${i}`).numFmt = fmtOrig; // Debit Orig
    sh.getCell(`I${i}`).numFmt = fmtOrig; // Credit Orig

    // If FX missing, mark visually (optional)
    if (row.fxStatus === 'MISSING') {
      sh.getCell(`G${i}`).value = 'FX MISSING';
      sh.getCell(`G${i}`).font = { color: { argb: 'FFFF0000' }, bold: true };
    }
  }

  // Totals row
  const totalsRowIndex = rows.length + 2;
  const tr = sh.getRow(totalsRowIndex);
  tr.getCell(1).value = 'TOTALS';
  tr.font = { bold: true };

  // Excel formulas for base totals
  if (rows.length > 0) {
    tr.getCell(10).value = { formula: `SUM(J2:J${totalsRowIndex - 1})` }; // Debit Base
    tr.getCell(11).value = { formula: `SUM(K2:K${totalsRowIndex - 1})` }; // Credit Base
    tr.getCell(12).value = { formula: `L${totalsRowIndex - 1}` }; // Closing (last running)
    tr.getCell(10).numFmt = baseFmt;
    tr.getCell(11).numFmt = baseFmt;
    tr.getCell(12).numFmt = baseFmt;
  }

  // Output
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
