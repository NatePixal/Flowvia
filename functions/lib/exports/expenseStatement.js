"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportExpenseStatementExcel = exportExpenseStatementExcel;
const admin = require("firebase-admin");
const exceljs_1 = require("exceljs");
const exportUtils_1 = require("./exportUtils");
function extractFxRate(fx) {
    var _a, _b;
    return (_b = (_a = fx === null || fx === void 0 ? void 0 : fx.enteredRate) !== null && _a !== void 0 ? _a : fx === null || fx === void 0 ? void 0 : fx.rateToBase) !== null && _b !== void 0 ? _b : undefined;
}
async function exportExpenseStatementExcel(input) {
    var _a, _b, _c, _d, _e;
    const db = admin.firestore();
    const range = (0, exportUtils_1.makeDateRange)(input.from, input.to);
    // Expect dailyExpenses docs: companyId, businessDate, category, description, amount, currency, fxRate, reference
    const expSnap = await db.collection("dailyExpenses")
        .where("companyId", "==", input.companyId)
        .where("date", ">=", range.from)
        .where("date", "<", range.toExclusive)
        .orderBy("date", "asc")
        .get();
    const wb = new exceljs_1.default.Workbook();
    (0, exportUtils_1.applyGlobalWorkbookStyle)(wb);
    const ws = wb.addWorksheet("Expenses");
    (0, exportUtils_1.setSheetPrintDefaults)(ws);
    ws.getColumn("A").width = 2;
    ws.getColumn("B").width = 14;
    ws.getColumn("C").width = 16;
    ws.getColumn("D").width = 34;
    ws.getColumn("E").width = 14;
    ws.getColumn("F").width = 12;
    ws.getColumn("G").width = 10;
    ws.getColumn("H").width = 18;
    (0, exportUtils_1.styleTitle)(ws, "FlowVia Business Solutions", "Expense Statement");
    (0, exportUtils_1.styleInfoRow)(ws, 5, "Base Currency:", input.baseCurrency);
    (0, exportUtils_1.styleInfoRow)(ws, 6, "Period:", `From ${input.from} to ${input.to}`);
    const headerRow = 12;
    ws.getRow(headerRow).values = ["", "Date", "Type", "Description", "Amount", "Currency", "FX Rate", "Amount (Base)"];
    (0, exportUtils_1.styleTableHeader)(ws, headerRow, 2, 8);
    let r = headerRow + 1;
    let totalBase = 0;
    for (const d of expSnap.docs) {
        const x = d.data();
        const baseMinor = Number((_a = x.amountBaseMinor) !== null && _a !== void 0 ? _a : 0);
        totalBase += baseMinor;
        ws.getRow(r).values = [
            "",
            (_b = x.date) === null || _b === void 0 ? void 0 : _b.toDate().toISOString().slice(0, 10),
            x.expenseType || "expense",
            x.description || "",
            Number((_c = x.amount) !== null && _c !== void 0 ? _c : 0),
            (_d = x.currency) !== null && _d !== void 0 ? _d : "",
            (_e = extractFxRate(x.fx)) !== null && _e !== void 0 ? _e : "",
            baseMinor / 100,
        ];
        (0, exportUtils_1.styleTableBodyRow)(ws, r, 2, 8);
        ws.getRow(r).getCell(8).numFmt = "#,##0.00";
        r++;
    }
    ws.getRow(r).values = ["", "Total", "", "", "", "", "", totalBase / 100];
    (0, exportUtils_1.styleTableBodyRow)(ws, r, 2, 8);
    ws.getRow(r).getCell(2).font = { bold: true };
    ws.getRow(r).getCell(8).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
//# sourceMappingURL=expenseStatement.js.map