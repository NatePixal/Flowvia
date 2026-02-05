"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStockReportExcel = exportStockReportExcel;
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");
const exportUtils_1 = require("./exportUtils");
function tsToISO(ts) {
    return ts.toDate().toISOString().slice(0, 10);
}
async function exportStockReportExcel(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    const db = admin.firestore();
    const range = (0, exportUtils_1.makeDateRange)(input.from, input.to);
    // --- IMPORTANT: we aggregate by productCode, so we need to read:
    // incomingProducts (before, range, all)
    // sales (before, range, all)
    //
    // If your dataset is huge, we can optimize later using server-side aggregates.
    // This version is correct and stable.
    const agg = new Map();
    function get(code) {
        if (!agg.has(code)) {
            agg.set(code, {
                productCode: code,
                incomingBefore: 0,
                incomingRange: 0,
                incomingAll: 0,
                soldBefore: 0,
                soldRange: 0,
                soldAll: 0,
                revenueRangeBaseMinor: 0,
                profitRangeBaseMinor: 0,
            });
        }
        return agg.get(code);
    }
    // --- Incoming: ALL (for asOfToday)
    // NOTE: no date filter here.
    const incAllSnap = await db.collection("incomingProducts")
        .where("companyId", "==", input.companyId)
        .get();
    for (const d of incAllSnap.docs) {
        const x = d.data();
        const code = String((_a = x.productCode) !== null && _a !== void 0 ? _a : "");
        if (!code)
            continue;
        const q = Number((_b = x.quantity) !== null && _b !== void 0 ? _b : 0);
        get(code).incomingAll += q;
        const dt = (_c = x.incomeDate) !== null && _c !== void 0 ? _c : x.date;
        if (dt === null || dt === void 0 ? void 0 : dt.toMillis) {
            if (dt.toMillis() < range.from.toMillis())
                get(code).incomingBefore += q;
            if (dt.toMillis() >= range.from.toMillis() && dt.toMillis() < range.toExclusive.toMillis()) {
                get(code).incomingRange += q;
            }
        }
    }
    // --- Sales: ALL (for asOfToday)
    const salesAllSnap = await db.collection("sales")
        .where("companyId", "==", input.companyId)
        .get();
    // Also build sales-by-day for the period sheet
    const salesByDay = new Map();
    for (const d of salesAllSnap.docs) {
        const s = d.data();
        const code = String((_d = s.productCode) !== null && _d !== void 0 ? _d : "");
        if (!code)
            continue;
        const q = Number((_e = s.quantity) !== null && _e !== void 0 ? _e : 0);
        get(code).soldAll += q;
        const dt = s.date;
        if (dt === null || dt === void 0 ? void 0 : dt.toMillis) {
            const ms = dt.toMillis();
            if (ms < range.from.toMillis())
                get(code).soldBefore += q;
            if (ms >= range.from.toMillis() && ms < range.toExclusive.toMillis()) {
                get(code).soldRange += q;
                get(code).revenueRangeBaseMinor += Number((_f = s.revenueBaseMinor) !== null && _f !== void 0 ? _f : 0);
                get(code).profitRangeBaseMinor += Number((_g = s.grossProfitBaseMinor) !== null && _g !== void 0 ? _g : 0);
                const day = tsToISO(dt);
                if (!salesByDay.has(day))
                    salesByDay.set(day, { units: 0, revenueMinor: 0, profitMinor: 0 });
                const bucket = salesByDay.get(day);
                bucket.units += q;
                bucket.revenueMinor += Number((_h = s.revenueBaseMinor) !== null && _h !== void 0 ? _h : 0);
                bucket.profitMinor += Number((_j = s.grossProfitBaseMinor) !== null && _j !== void 0 ? _j : 0);
            }
        }
    }
    // Optionally enrich with product names (if you have products collection)
    const productNameByCode = new Map();
    try {
        const prodSnap = await db.collection("products")
            .where("companyId", "==", input.companyId)
            .get();
        for (const d of prodSnap.docs) {
            const p = d.data();
            const code = String((_m = (_l = (_k = p.productCode) !== null && _k !== void 0 ? _k : p.code) !== null && _l !== void 0 ? _l : p.sku) !== null && _m !== void 0 ? _m : "");
            if (!code)
                continue;
            productNameByCode.set(code, (_p = (_o = p.productName) !== null && _o !== void 0 ? _o : p.name) !== null && _p !== void 0 ? _p : "");
        }
    }
    catch (_q) {
        // ignore if products schema differs
    }
    // Build rows
    const rows = Array.from(agg.values()).map(a => {
        var _a;
        const opening = a.incomingBefore - a.soldBefore;
        const closing = opening + a.incomingRange - a.soldRange;
        const onHandToday = a.incomingAll - a.soldAll;
        return {
            code: a.productCode,
            name: (_a = productNameByCode.get(a.productCode)) !== null && _a !== void 0 ? _a : "",
            opening,
            incoming: a.incomingRange,
            sold: a.soldRange,
            closing,
            onHandToday,
            revenue: a.revenueRangeBaseMinor,
            profit: a.profitRangeBaseMinor,
        };
    });
    // Demand sheet sorted by units sold
    const demand = [...rows].sort((a, b) => (b.sold - a.sold));
    // Sales-by-day sorted
    const daily = Array.from(salesByDay.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => (Object.assign({ day }, v)));
    // --- Excel ---
    const wb = new ExcelJS.Workbook();
    (0, exportUtils_1.applyGlobalWorkbookStyle)(wb);
    // ===== Sheet 1: Stock Summary
    const ws = wb.addWorksheet("Stock Summary");
    (0, exportUtils_1.setSheetPrintDefaults)(ws);
    ws.getColumn("A").width = 2;
    ws.getColumn("B").width = 16; // code
    ws.getColumn("C").width = 26; // name
    ws.getColumn("D").width = 12; // opening
    ws.getColumn("E").width = 12; // incoming
    ws.getColumn("F").width = 12; // sold
    ws.getColumn("G").width = 12; // closing
    ws.getColumn("H").width = 14; // on hand today
    ws.getColumn("I").width = 16; // revenue
    ws.getColumn("J").width = 16; // profit
    (0, exportUtils_1.styleTitle)(ws, "FlowVia Business Solutions", "Inventory Stock Report");
    (0, exportUtils_1.styleInfoRow)(ws, 5, "Mode:", input.stockMode);
    (0, exportUtils_1.styleInfoRow)(ws, 6, "Base Currency:", input.baseCurrency);
    (0, exportUtils_1.styleInfoRow)(ws, 7, "Period:", `From ${input.from} to ${input.to}`);
    const headerRow = 12;
    ws.getRow(headerRow).values = [
        "",
        "Product Code",
        "Product Name",
        "Opening Qty",
        "Incoming Qty",
        "Sold Qty",
        "Closing Qty",
        "On Hand Today",
        "Revenue (Base)",
        "Gross Profit (Base)",
    ];
    (0, exportUtils_1.styleTableHeader)(ws, headerRow, 2, 10);
    let r = headerRow + 1;
    for (const x of rows) {
        ws.getRow(r).values = [
            "",
            x.code,
            x.name,
            input.stockMode === "asOfToday" ? "" : x.opening,
            input.stockMode === "asOfToday" ? "" : x.incoming,
            input.stockMode === "asOfToday" ? "" : x.sold,
            input.stockMode === "asOfToday" ? "" : x.closing,
            (input.stockMode === "range") ? "" : x.onHandToday,
            x.revenue / 100,
            x.profit / 100,
        ];
        (0, exportUtils_1.styleTableBodyRow)(ws, r, 2, 10);
        ws.getRow(r).getCell(9).numFmt = "#,##0.00";
        ws.getRow(r).getCell(10).numFmt = "#,##0.00";
        r++;
    }
    // ===== Sheet 2: Demand
    const ws2 = wb.addWorksheet("Demand");
    (0, exportUtils_1.setSheetPrintDefaults)(ws2);
    ws2.getColumn("A").width = 2;
    ws2.getColumn("B").width = 16;
    ws2.getColumn("C").width = 26;
    ws2.getColumn("D").width = 12; // units sold
    ws2.getColumn("E").width = 16; // revenue
    ws2.getColumn("F").width = 16; // profit
    ws2.getColumn("G").width = 16; // avg price
    (0, exportUtils_1.styleTitle)(ws2, "FlowVia Business Solutions", "Top Demanding Products");
    (0, exportUtils_1.styleInfoRow)(ws2, 5, "Period:", `From ${input.from} to ${input.to}`);
    const hr2 = 12;
    ws2.getRow(hr2).values = ["", "Product Code", "Product Name", "Units Sold", "Revenue (Base)", "Gross Profit (Base)", "Avg Sell Price"];
    (0, exportUtils_1.styleTableHeader)(ws2, hr2, 2, 7);
    let rr = hr2 + 1;
    for (const x of demand) {
        const avg = x.sold > 0 ? (x.revenue / 100) / x.sold : 0;
        ws2.getRow(rr).values = ["", x.code, x.name, x.sold, x.revenue / 100, x.profit / 100, avg];
        (0, exportUtils_1.styleTableBodyRow)(ws2, rr, 2, 7);
        ws2.getRow(rr).getCell(5).numFmt = "#,##0.00";
        ws2.getRow(rr).getCell(6).numFmt = "#,##0.00";
        ws2.getRow(rr).getCell(7).numFmt = "#,##0.00";
        rr++;
    }
    // ===== Sheet 3: Sales by Day
    const ws3 = wb.addWorksheet("Sales by Day");
    (0, exportUtils_1.setSheetPrintDefaults)(ws3);
    ws3.getColumn("A").width = 2;
    ws3.getColumn("B").width = 14;
    ws3.getColumn("C").width = 12;
    ws3.getColumn("D").width = 16;
    ws3.getColumn("E").width = 16;
    (0, exportUtils_1.styleTitle)(ws3, "FlowVia Business Solutions", "Sales Performance by Day");
    (0, exportUtils_1.styleInfoRow)(ws3, 5, "Period:", `From ${input.from} to ${input.to}`);
    const hr3 = 12;
    ws3.getRow(hr3).values = ["", "Date", "Units Sold", "Revenue (Base)", "Gross Profit (Base)"];
    (0, exportUtils_1.styleTableHeader)(ws3, hr3, 2, 5);
    let r3 = hr3 + 1;
    for (const d of daily) {
        ws3.getRow(r3).values = ["", d.day, d.units, d.revenueMinor / 100, d.profitMinor / 100];
        (0, exportUtils_1.styleTableBodyRow)(ws3, r3, 2, 5);
        ws3.getRow(r3).getCell(4).numFmt = "#,##0.00";
        ws3.getRow(r3).getCell(5).numFmt = "#,##0.00";
        r3++;
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
//# sourceMappingURL=stockReport.js.map