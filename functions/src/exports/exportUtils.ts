import type { Workbook, Worksheet } from 'exceljs';

export function applyGlobalWorkbookStyle(wb: Workbook) {
  wb.creator = 'FlowVia';
  wb.created = new Date();
  // enables Excel to correctly handle dates
  wb.properties.date1904 = true; 
}

export function makeDateRange(from: string, to: string) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1));
    return { from: fromDate, toExclusive };
}

export function setSheetPrintDefaults(ws: Worksheet) {
    ws.pageSetup.printArea = 'A1:J50';
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToHeight = 0; // Set to 0 to allow multiple pages vertically
    ws.pageSetup.fitToWidth = 1;
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
        cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFDDDDDD'} };
        cell.border = { bottom: { style: 'thin' } };
    }
}

export function styleTableBodyRow(ws: Worksheet, row: number, startCol: number, endCol: number) {
     for (let i = startCol; i <= endCol; i++) {
        const cell = ws.getRow(row).getCell(i);
        cell.border = { bottom: { style: 'dotted', color: { argb: 'FFDDDDDD' } } };
    }
}
