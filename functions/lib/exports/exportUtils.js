"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyGlobalWorkbookStyle = applyGlobalWorkbookStyle;
exports.makeDateRange = makeDateRange;
exports.setSheetPrintDefaults = setSheetPrintDefaults;
exports.styleTitle = styleTitle;
exports.styleInfoRow = styleInfoRow;
exports.styleTableHeader = styleTableHeader;
exports.styleTableBodyRow = styleTableBodyRow;
function applyGlobalWorkbookStyle(wb) {
    wb.creator = 'FlowVia';
    wb.created = new Date();
    // enables Excel to correctly handle dates
    wb.properties.date1904 = true;
}
function makeDateRange(from, to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const toExclusive = new Date(Date.UTC(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1));
    return { from: fromDate, toExclusive };
}
function setSheetPrintDefaults(ws) {
    ws.pageSetup.printArea = 'A1:J50';
    ws.pageSetup.fitToPage = true;
    ws.pageSetup.fitToHeight = 0; // Set to 0 to allow multiple pages vertically
    ws.pageSetup.fitToWidth = 1;
}
function styleTitle(ws, title, subtitle) {
    ws.getCell('B2').value = title;
    ws.getCell('B2').font = { name: 'Arial', size: 16, bold: true };
    ws.getCell('B3').value = subtitle;
    ws.getCell('B3').font = { name: 'Arial', size: 12 };
}
function styleInfoRow(ws, row, label, value) {
    ws.getCell(`B${row}`).value = label;
    ws.getCell(`B${row}`).font = { bold: true };
    ws.getCell(`C${row}`).value = value;
}
function styleTableHeader(ws, row, startCol, endCol) {
    for (let i = startCol; i <= endCol; i++) {
        const cell = ws.getRow(row).getCell(i);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDDDDD' } };
        cell.border = { bottom: { style: 'thin' } };
    }
}
function styleTableBodyRow(ws, row, startCol, endCol) {
    for (let i = startCol; i <= endCol; i++) {
        const cell = ws.getRow(row).getCell(i);
        cell.border = { bottom: { style: 'dotted', color: { argb: 'FFDDDDDD' } } };
    }
}
//# sourceMappingURL=exportUtils.js.map