import type { Workbook, Worksheet } from 'exceljs';

export function applyGlobalWorkbookStyle(wb: Workbook) {
  wb.creator = 'FlowVia';
  wb.created = new Date();
  // enables Excel to correctly handle dates
  wb.properties.date1904 = true;
}

export function makeDateRange(from: string, to: string) {
  // Parse YYYY-MM-DD as UTC midnight to avoid timezone drift.
  const parseYMD = (s: string) => {
    const [y, m, d] = String(s).split('-').map((x) => Number(x));
    if (!y || !m || !d) return new Date(NaN);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const fromDate = parseYMD(from);
  const toDate = parseYMD(to);
  const toExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);

  return { from: fromDate, to: toDate, toExclusive };
}

export function setSheetPrintDefaults(ws: Worksheet) {
  // Don't hard-code printArea (it can clip large exports when users Print/PDF).
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToHeight = 0; // 0 = as many pages tall as needed
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.paperSize = 9; // A4
  ws.pageSetup.margins = {
    left: 0.3,
    right: 0.3,
    top: 0.5,
    bottom: 0.5,
    header: 0.3,
    footer: 0.3,
  };
}

export function styleTitle(ws: Worksheet, title: string, subtitle: string) {
  ws.getCell('B2').value = title;
  ws.getCell('B2').font = { name: 'Arial', size: 16, bold: true };
  ws.getCell('B3').value = subtitle;
  ws.getCell('B3').font = { name: 'Arial', size: 12 };
}

export function styleInfoRow(ws: Worksheet, row: number, label: string, value: string) {
  ws.getCell(`B${row}`).value = label;
  ws.getCell(`B${row}`).font = { bold: true };
  ws.getCell(`C${row}`).value = value;
}

export function styleTableHeader(ws: Worksheet, row: number, startCol: number, endCol: number) {
  for (let i = startCol; i <= endCol; i++) {
    const cell = ws.getRow(row).getCell(i);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } };
    cell.border = { bottom: { style: 'thin' } };
  }
}

export function styleTableBodyRow(ws: Worksheet, row: number, startCol: number, endCol: number) {
  for (let i = startCol; i <= endCol; i++) {
    const cell = ws.getRow(row).getCell(i);
    cell.border = { bottom: { style: 'dotted', color: { argb: 'FFDDDDDD' } } };
  }
}
