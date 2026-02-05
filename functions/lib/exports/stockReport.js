"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildStockReportXlsx = buildStockReportXlsx;
const ExcelJS = require("exceljs");
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function toISODate(value) {
    if (!value)
        return null;
    // Firestore Timestamp support (admin.firestore.Timestamp)
    if (typeof value.toDate === "function") {
        const d = value.toDate();
        return d.toISOString().slice(0, 10);
    }
    // JS Date
    if (value instanceof Date)
        return value.toISOString().slice(0, 10);
    // string already
    if (typeof value === "string")
        return value.slice(0, 10);
    return null;
}
function applySheetBranding(ws, companyName, reportTitle, columnCount) {
    // A1..G1 merged
    ws.mergeCells(1, 1, 1, columnCount);
    ws.getCell(1, 1).value = companyName;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(1, 1).alignment = { horizontal: "center", vertical: "middle" };
    ws.mergeCells(2, 1, 2, columnCount);
    ws.getCell(2, 1).value = reportTitle;
    ws.getCell(2, 1).font = { bold: true, size: 12 };
    ws.getCell(2, 1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;
    ws.getRow(2).height = 18;
}
function styleHeaderRow(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height = 18;
    row.eachCell((cell) => {
        cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "1F4E79" }, // deep blue
        };
        cell.border = {
            top: { style: "thin", color: { argb: "D0D0D0" } },
            left: { style: "thin", color: { argb: "D0D0D0" } },
            bottom: { style: "thin", color: { argb: "D0D0D0" } },
            right: { style: "thin", color: { argb: "D0D0D0" } },
        };
    });
}
function zebraAndBorders(ws, startRow) {
    const last = ws.rowCount;
    for (let r = startRow; r <= last; r++) {
        const row = ws.getRow(r);
        if ((r - startRow) % 2 === 1) {
            row.eachCell((cell) => {
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "F5F7FA" }, // light gray
                };
            });
        }
        row.eachCell((cell) => {
            cell.border = {
                top: { style: "thin", color: { argb: "D0D0D0" } },
                left: { style: "thin", color: { argb: "D0D0D0" } },
                bottom: { style: "thin", color: { argb: "D0D0D0" } },
                right: { style: "thin", color: { argb: "D0D0D0" } },
            };
            cell.alignment = { vertical: "middle" };
        });
    }
}
function autoFit(ws) {
    ws.columns.forEach((col) => {
        if (col) {
            let max = 10;
            col.eachCell({ includeEmpty: true }, (cell) => {
                const v = cell.value;
                const text = v == null
                    ? ""
                    : typeof v === "object" && "richText" in v
                        ? JSON.stringify(v)
                        : String(v);
                max = Math.max(max, text.length);
            });
            col.width = Math.min(45, max + 2);
        }
    });
}
function setColumnFormats(ws, headers) {
    const headerIndex = {};
    headers.forEach((h, i) => (headerIndex[h] = i + 1));
    const dateCols = headers
        .map((h, i) => ({ h, i: i + 1 }))
        .filter(({ h }) => h.toLowerCase().includes("date"))
        .map((x) => x.i);
    const moneyCols = headers
        .map((h, i) => ({ h, i: i + 1 }))
        .filter(({ h }) => {
        const s = h.toLowerCase();
        return (s.includes("price") ||
            s.includes("rate") ||
            s.includes("value") ||
            s.includes("total") ||
            s.includes("amount") ||
            s.includes("paid"));
    })
        .map((x) => x.i);
    // Apply numFmt for all rows (data rows)
    for (let r = 4; r <= ws.rowCount; r++) {
        dateCols.forEach((c) => {
            const cell = ws.getCell(r, c);
            if (cell.value)
                cell.numFmt = "yyyy-mm-dd";
        });
        moneyCols.forEach((c) => {
            const cell = ws.getCell(r, c);
            if (typeof cell.value === "number")
                cell.numFmt = "#,##0.00";
        });
    }
}
function addTable(ws, headers, rows, startRow) {
    // write header row
    const headerRow = ws.getRow(startRow);
    headerRow.values = ["", ...headers];
    styleHeaderRow(headerRow);
    // write data
    for (let i = 0; i < rows.length; i++) {
        const row = ws.getRow(startRow + 1 + i);
        const obj = rows[i];
        row.values = ["", ...headers.map((h) => { var _a; return (_a = obj[h]) !== null && _a !== void 0 ? _a : null; })];
    }
    zebraAndBorders(ws, startRow + 1);
    setColumnFormats(ws, headers);
    autoFit(ws);
}
async function buildStockReportXlsx(params) {
    const { companyName, stockRows, supplierRows, clientRows } = params;
    const wb = new ExcelJS.Workbook();
    wb.creator = "FlowVia";
    wb.created = new Date();
    // --- Sheet 1
    const ws1 = wb.addWorksheet("Stock & Incoming");
    const headers1 = [
        "Product Name",
        "Current Stock Level",
        "Last Arrival Date",
        "Arrival Quantity",
        "Unit Purchase Price",
        "Exchange Rate",
        "Total Value",
    ];
    applySheetBranding(ws1, companyName, "Stock Availability & Incoming Products", headers1.length);
    addTable(ws1, headers1, stockRows, 4);
    // --- Sheet 2
    const ws2 = wb.addWorksheet("Suppliers");
    const headers2 = [
        "Date of Transfer",
        "Supplier Name",
        "Product Purchased",
        "Quantity Bought",
        "Purchase Price (Original Currency)",
        "Daily Exchange Rate",
        "Total Paid (Local Currency)",
    ];
    applySheetBranding(ws2, companyName, "Supplier Transactions", headers2.length);
    addTable(ws2, headers2, supplierRows, 4);
    // --- Sheet 3
    const ws3 = wb.addWorksheet("Clients");
    const headers3 = [
        "Client Name",
        "Purchase Date",
        "Product Name",
        "Quantity Purchased",
        "Unit Sale Price",
        "Exchange Rate (Day of Purchase)",
        "Total Amount Due",
        "Payment Status",
    ];
    applySheetBranding(ws3, companyName, "Client Loans & Sales", headers3.length);
    addTable(ws3, headers3, clientRows, 4);
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
}
//# sourceMappingURL=stockReport.js.map