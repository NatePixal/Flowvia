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
    // Parse YYYY-MM-DD as UTC midnight to avoid timezone drift.
    const parseYMD = (s) => {
        const [y, m, d] = String(s).split('-').map((x) => Number(x));
        if (!y || !m || !d)
            return new Date(NaN);
        return new Date(Date.UTC(y, m - 1, d));
    };
    const fromDate = parseYMD(from);
    const toDate = parseYMD(to);
    const toExclusive = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
    return { from: fromDate, to: toDate, toExclusive };
}
function setSheetPrintDefaults(ws) {
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