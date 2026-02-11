"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStockReportExcel = exportStockReportExcel;
// functions/src/exports/stockReport.ts
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");
const exportUtils_1 = require("./exportUtils");
const money_1 = require("./money");
const TRANSLATIONS = {
    en: {
        sheet_summary: "Stock Summary",
        sheet_demand: "Demand",
        sheet_daily: "Sales by Day",
        title_summary: "Inventory Stock Report",
        title_demand: "Top Demanding Products",
        title_daily: "Sales Performance by Day",
        info_mode: "Mode:",
        info_currency: "Base Currency:",
        info_period: "Period:",
        h_prod_code: "Product Code",
        h_prod_name: "Product Name",
        h_opening: "Opening Qty",
        h_incoming: "Incoming Qty",
        h_sold: "Sold Qty",
        h_remaining: "Remaining Qty",
        h_origin_price: "Price (Origin)",
        h_revenue: "Revenue (Base)",
        h_profit: "Gross Profit (Base)",
        h_profit_pct: "Gross Profit %",
        h_avg_price: "Avg Sell Price",
        h_date: "Date",
        h_units_sold: "Units Sold",
        h_products_sold: "Products Sold",
    },
    ru: {
        sheet_summary: "Сводка по складу",
        sheet_demand: "Спрос",
        sheet_daily: "Продажи по дням",
        title_summary: "Отчет по складу",
        title_demand: "Самые востребованные товары",
        title_daily: "Динамика продаж по дням",
        info_mode: "Режим:",
        info_currency: "Базовая валюта:",
        info_period: "Период:",
        h_prod_code: "Код товара",
        h_prod_name: "Название товара",
        h_opening: "Начальный остаток",
        h_incoming: "Поступления",
        h_sold: "Продано",
        h_remaining: "Конечный остаток",
        h_origin_price: "Себестоимость",
        h_revenue: "Выручка (баз.)",
        h_profit: "Валовая прибыль (баз.)",
        h_profit_pct: "Валовая прибыль %",
        h_avg_price: "Средняя цена продажи",
        h_date: "Дата",
        h_units_sold: "Продано (шт.)",
        h_products_sold: "Проданные товары",
    },
    uz: {
        sheet_summary: "Omborxona xulosasi",
        sheet_demand: "Talab",
        sheet_daily: "Kunlik sotuvlar",
        title_summary: "Omborxona hisoboti",
        title_demand: "Eng talabgir mahsulotlar",
        title_daily: "Kunlar bo'yicha sotuvlar dinamikasi",
        info_mode: "Rejim:",
        info_currency: "Asosiy valyuta:",
        info_period: "Davr:",
        h_prod_code: "Mahsulot kodi",
        h_prod_name: "Mahsulot nomi",
        h_opening: "Boshlang'ich qoldiq",
        h_incoming: "Kirim",
        h_sold: "Sotilgan",
        h_remaining: "Yakuniy qoldiq",
        h_origin_price: "Tannarx",
        h_revenue: "Tushum (asosiy)",
        h_profit: "Yalpi foyda (asosiy)",
        h_profit_pct: "Yalpi foyda %",
        h_avg_price: "O'rtacha sotish narxi",
        h_date: "Sana",
        h_units_sold: "Sotilgan (dona)",
        h_products_sold: "Sotilgan mahsulotlar",
    },
    ar: {
        sheet_summary: "ملخص المخزون",
        sheet_demand: "الطلب",
        sheet_daily: "المبيعات اليومية",
        title_summary: "تقرير المخزون",
        title_demand: "المنتجات الأكثر طلباً",
        title_daily: "أداء المبيعات اليومي",
        info_mode: "الوضع:",
        info_currency: "العملة الأساسية:",
        info_period: "الفترة:",
        h_prod_code: "رمز المنتج",
        h_prod_name: "اسم المنتج",
        h_opening: "الكمية الافتتاحية",
        h_incoming: "الكمية الواردة",
        h_sold: "الكمية المباعة",
        h_remaining: "الكمية المتبقية",
        h_origin_price: "سعر التكلفة",
        h_revenue: "الإيرادات (أساسي)",
        h_profit: "إجمالي الربح (أساسي)",
        h_profit_pct: "نسبة إجمالي الربح",
        h_avg_price: "متوسط سعر البيع",
        h_date: "التاريخ",
        h_units_sold: "الوحدات المباعة",
        h_products_sold: "المنتجات المباعة",
    }
};
function t(locale, key) {
    const lang = TRANSLATIONS[locale || 'en'] || TRANSLATIONS.en;
    return lang[key] || TRANSLATIONS.en[key] || key;
}
function anyToMillis(v) {
    var _a, _b;
    if (!v)
        return null;
    if (typeof v === "number")
        return v;
    if (v instanceof Date)
        return v.getTime();
    if (typeof v === "string") {
        const d = new Date(v);
        return Number.isFinite(d.getTime()) ? d.getTime() : null;
    }
    if (typeof v.toMillis === "function")
        return v.toMillis();
    if (typeof v.toDate === "function") {
        const d = v.toDate();
        return (_b = (_a = d === null || d === void 0 ? void 0 : d.getTime) === null || _a === void 0 ? void 0 : _a.call(d)) !== null && _b !== void 0 ? _b : null;
    }
    return null;
}
function anyToISODate(v) {
    if (!v)
        return "";
    const d = v instanceof Date ? v : typeof v.toDate === "function" ? v.toDate() : new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}
async function exportStockReportExcel(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const db = admin.firestore();
    const range = (0, exportUtils_1.makeDateRange)(input.from, input.to);
    const locale = input.locale || 'en';
    const agg = new Map();
    function get(code) {
        if (!agg.has(code)) {
            agg.set(code, {
                productCode: code,
                incomingBefore: 0, incomingRange: 0, incomingAll: 0,
                soldBefore: 0, soldRange: 0, soldAll: 0,
                revenueRangeBaseMinor: 0, profitRangeBaseMinor: 0,
            });
        }
        return agg.get(code);
    }
    const incAllSnap = await db.collection("companies").doc(input.companyId).collection("incomingProducts").get();
    for (const d of incAllSnap.docs) {
        const x = d.data();
        const code = String((_a = x.productCode) !== null && _a !== void 0 ? _a : "");
        if (!code)
            continue;
        const q = Number((_b = x.quantity) !== null && _b !== void 0 ? _b : 0);
        get(code).incomingAll += q;
        const dt = (_c = x.incomeDate) !== null && _c !== void 0 ? _c : x.date;
        const ms = anyToMillis(dt);
        if (ms != null) {
            if (ms < range.from.getTime())
                get(code).incomingBefore += q;
            if (ms >= range.from.getTime() && ms < range.toExclusive.getTime())
                get(code).incomingRange += q;
        }
    }
    const salesAllSnap = await db.collection("companies").doc(input.companyId).collection("sales").get();
    const salesByDay = new Map();
    for (const d of salesAllSnap.docs) {
        const s = d.data();
        const code = String((_d = s.productCode) !== null && _d !== void 0 ? _d : "");
        if (!code)
            continue;
        const q = Number((_e = s.quantity) !== null && _e !== void 0 ? _e : 0);
        get(code).soldAll += q;
        const dt = s.date;
        const ms = anyToMillis(dt);
        if (ms != null) {
            if (ms < range.from.getTime())
                get(code).soldBefore += q;
            if (ms >= range.from.getTime() && ms < range.toExclusive.getTime()) {
                get(code).soldRange += q;
                get(code).revenueRangeBaseMinor += Number((_f = s.revenueBaseMinor) !== null && _f !== void 0 ? _f : 0);
                get(code).profitRangeBaseMinor += Number((_g = s.grossProfitBaseMinor) !== null && _g !== void 0 ? _g : 0);
                const day = anyToISODate(dt);
                if (!salesByDay.has(day)) {
                    salesByDay.set(day, { units: 0, revenueMinor: 0, profitMinor: 0, products: new Map() });
                }
                const bucket = salesByDay.get(day);
                bucket.units += q;
                bucket.revenueMinor += Number((_h = s.revenueBaseMinor) !== null && _h !== void 0 ? _h : 0);
                bucket.profitMinor += Number((_j = s.grossProfitBaseMinor) !== null && _j !== void 0 ? _j : 0);
                bucket.products.set(code, (bucket.products.get(code) || 0) + q);
            }
        }
    }
    const productNameByCode = new Map();
    const productsByCode = new Map();
    try {
        const prodSnap = await db.collection("companies").doc(input.companyId).collection("products").get();
        for (const d of prodSnap.docs) {
            const p = d.data();
            const code = String((_l = (_k = p.productCode) !== null && _k !== void 0 ? _k : p.id) !== null && _l !== void 0 ? _l : "");
            if (code) {
                productsByCode.set(code, p);
                productNameByCode.set(code, p.name);
            }
        }
    }
    catch ( /* ignore */_m) { /* ignore */ }
    const rows = Array.from(agg.values()).map(a => {
        var _a, _b, _c, _d, _e, _f, _g;
        const opening = a.incomingBefore - a.soldBefore;
        const closing = opening + a.incomingRange - a.soldRange;
        const onHandToday = a.incomingAll - a.soldAll;
        const remainingQty = input.stockMode === "range" ? closing : onHandToday;
        const productDoc = productsByCode.get(a.productCode);
        let priceOrigin = "";
        if (productDoc) {
            const p = productDoc;
            const purchasePriceMinor = (_c = (_b = (_a = p.purchasePriceMinor) !== null && _a !== void 0 ? _a : p.costMinor) !== null && _b !== void 0 ? _b : p.avgCostMinor) !== null && _c !== void 0 ? _c : p.averageCostMinor;
            if (typeof purchasePriceMinor === 'number') {
                priceOrigin = (0, money_1.minorToMajor)(purchasePriceMinor, (p.purchasePriceCurrency || input.baseCurrency));
            }
            else {
                const purchasePriceMajor = (_f = (_e = (_d = p.purchasePrice) !== null && _d !== void 0 ? _d : p.cost) !== null && _e !== void 0 ? _e : p.avgCost) !== null && _f !== void 0 ? _f : p.averageCost;
                if (typeof purchasePriceMajor === 'number')
                    priceOrigin = purchasePriceMajor;
            }
        }
        if (priceOrigin === "" && a.soldRange > 0 && a.revenueRangeBaseMinor > 0) {
            const costOfGoodsSold = a.revenueRangeBaseMinor - a.profitRangeBaseMinor;
            priceOrigin = (0, money_1.minorToMajor)(costOfGoodsSold, input.baseCurrency) / a.soldRange;
        }
        return {
            code: a.productCode,
            name: (_g = productNameByCode.get(a.productCode)) !== null && _g !== void 0 ? _g : "",
            opening,
            incoming: a.incomingRange,
            sold: a.soldRange,
            remainingQty,
            priceOrigin,
            revenue: a.revenueRangeBaseMinor,
            profit: a.profitRangeBaseMinor,
        };
    });
    const wb = new ExcelJS.Workbook();
    (0, exportUtils_1.applyGlobalWorkbookStyle)(wb);
    const isRTL = locale === 'ar';
    // ===== Sheet 1: Stock Summary =====
    const ws = wb.addWorksheet(t(locale, 'sheet_summary'));
    if (isRTL)
        ws.views = [{ rightToLeft: true }];
    (0, exportUtils_1.setSheetPrintDefaults)(ws);
    ws.columns = [
        { width: 2 }, { width: 16 }, { width: 26 }, { width: 12 }, { width: 13 },
        { width: 13 }, { width: 16 }, { width: 13 }, { width: 16 }, { width: 13 },
    ];
    (0, exportUtils_1.styleTitle)(ws, t(locale, 'title_summary'), t(locale, 'company'));
    if (isRTL) {
        ws.getCell('B2').alignment = { horizontal: 'right' };
        ws.getCell('B3').alignment = { horizontal: 'right' };
    }
    (0, exportUtils_1.styleInfoRow)(ws, 5, t(locale, 'info_mode'), input.stockMode);
    (0, exportUtils_1.styleInfoRow)(ws, 6, t(locale, 'info_currency'), input.baseCurrency);
    (0, exportUtils_1.styleInfoRow)(ws, 7, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
    if (isRTL) {
        ws.getCell('B5').alignment = { horizontal: 'right' };
        ws.getCell('B6').alignment = { horizontal: 'right' };
        ws.getCell('B7').alignment = { horizontal: 'right' };
    }
    const hr1 = 12;
    ws.getRow(hr1).values = ["", t(locale, 'h_prod_code'), t(locale, 'h_prod_name'), t(locale, 'h_opening'), t(locale, 'h_incoming'), t(locale, 'h_sold'), t(locale, 'h_remaining'), t(locale, 'h_origin_price'), t(locale, 'h_revenue'), t(locale, 'h_profit')];
    (0, exportUtils_1.styleTableHeader)(ws, hr1, 2, 10);
    ws.autoFilter = { from: { row: hr1, column: 2 }, to: { row: hr1, column: 10 } };
    ws.views = [{ state: 'frozen', ySplit: hr1, rightToLeft: isRTL }];
    let r1 = hr1 + 1;
    for (const x of rows) {
        ws.getRow(r1).values = ["", x.code, x.name, input.stockMode === "asOfToday" ? "" : x.opening, input.stockMode === "asOfToday" ? "" : x.incoming, input.stockMode === "asOfToday" ? "" : x.sold, x.remainingQty, x.priceOrigin, (0, money_1.minorToMajor)(x.revenue, input.baseCurrency), (0, money_1.minorToMajor)(x.profit, input.baseCurrency)];
        (0, exportUtils_1.styleTableBodyRow)(ws, r1, 2, 10);
        ws.getRow(r1).getCell(4).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(5).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(6).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(7).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(8).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(9).numFmt = "#,##0.00";
        ws.getRow(r1).getCell(10).numFmt = "#,##0.00";
        r1++;
    }
    // ===== Sheet 2: Demand =====
    const ws2 = wb.addWorksheet(t(locale, 'sheet_demand'));
    if (isRTL)
        ws2.views = [{ rightToLeft: true }];
    (0, exportUtils_1.setSheetPrintDefaults)(ws2);
    ws2.columns = [{ width: 2 }, { width: 16 }, { width: 26 }, { width: 12 }, { width: 16 }, { width: 23.4 }, { width: 18.3 }, { width: 16 }];
    (0, exportUtils_1.styleTitle)(ws2, t(locale, 'title_demand'), t(locale, 'company'));
    if (isRTL) {
        ws2.getCell('B2').alignment = { horizontal: 'right' };
        ws2.getCell('B3').alignment = { horizontal: 'right' };
    }
    (0, exportUtils_1.styleInfoRow)(ws2, 5, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
    if (isRTL) {
        ws2.getCell('B5').alignment = { horizontal: 'right' };
    }
    const hr2 = 12;
    ws2.getRow(hr2).values = ["", t(locale, 'h_prod_code'), t(locale, 'h_prod_name'), t(locale, 'h_units_sold'), t(locale, 'h_revenue'), t(locale, 'h_profit'), t(locale, 'h_profit_pct'), t(locale, 'h_avg_price')];
    (0, exportUtils_1.styleTableHeader)(ws2, hr2, 2, 8);
    ws2.autoFilter = { from: { row: hr2, column: 2 }, to: { row: hr2, column: 8 } };
    ws2.views = [{ state: 'frozen', ySplit: hr2, rightToLeft: isRTL }];
    let r2 = hr2 + 1;
    const demand = [...rows].sort((a, b) => (b.sold - a.sold));
    for (const x of demand) {
        const revenue = (0, money_1.minorToMajor)(x.revenue, input.baseCurrency);
        const profit = (0, money_1.minorToMajor)(x.profit, input.baseCurrency);
        const gpPct = revenue > 0 ? profit / revenue : 0;
        const avgSellPrice = x.sold > 0 ? revenue / x.sold : 0;
        ws2.getRow(r2).values = ["", x.code, x.name, x.sold, revenue, profit, gpPct, avgSellPrice];
        (0, exportUtils_1.styleTableBodyRow)(ws2, r2, 2, 8);
        ws2.getRow(r2).getCell(5).numFmt = "#,##0.00";
        ws2.getRow(r2).getCell(6).numFmt = "#,##0.00";
        ws2.getRow(r2).getCell(7).numFmt = "0.00%";
        ws2.getRow(r2).getCell(8).numFmt = "#,##0.00";
        r2++;
    }
    // ===== Sheet 3: Sales by Day =====
    const ws3 = wb.addWorksheet(t(locale, 'sheet_daily'));
    if (isRTL)
        ws3.views = [{ rightToLeft: true }];
    (0, exportUtils_1.setSheetPrintDefaults)(ws3);
    ws3.columns = [{ width: 2 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 16 }, { width: 23 }, { width: 19 }, { width: 44 }];
    (0, exportUtils_1.styleTitle)(ws3, t(locale, 'title_daily'), t(locale, 'company'));
    if (isRTL) {
        ws3.getCell('B2').alignment = { horizontal: 'right' };
        ws3.getCell('B3').alignment = { horizontal: 'right' };
    }
    (0, exportUtils_1.styleInfoRow)(ws3, 5, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
    if (isRTL) {
        ws3.getCell('B5').alignment = { horizontal: 'right' };
    }
    const hr3 = 12;
    ws3.getRow(hr3).values = ["", t(locale, 'h_date'), t(locale, 'h_units_sold'), t(locale, 'h_origin_price'), t(locale, 'h_revenue'), t(locale, 'h_profit'), t(locale, 'h_profit_pct'), t(locale, 'h_products_sold')];
    (0, exportUtils_1.styleTableHeader)(ws3, hr3, 2, 8);
    ws3.autoFilter = { from: { row: hr3, column: 2 }, to: { row: hr3, column: 8 } };
    ws3.views = [{ state: 'frozen', ySplit: hr3, rightToLeft: isRTL }];
    let r3 = hr3 + 1;
    const daily = Array.from(salesByDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => (Object.assign({ day }, v)));
    for (const d of daily) {
        const units = d.units;
        const revenue = (0, money_1.minorToMajor)(d.revenueMinor, input.baseCurrency);
        const profit = (0, money_1.minorToMajor)(d.profitMinor, input.baseCurrency);
        const priceOrigin = units > 0 ? (revenue - profit) / units : 0;
        const gpPct = revenue > 0 ? profit / revenue : 0;
        const productsSold = Array.from(d.products.entries())
            .sort((a, b) => b[1] - a[1]) // sort by qty desc
            .map(([code, qty]) => { var _a; return `${(_a = productNameByCode.get(code)) !== null && _a !== void 0 ? _a : code} (${qty})`; })
            .join(', ');
        ws3.getRow(r3).values = ["", d.day, units, priceOrigin, revenue, profit, gpPct, productsSold];
        (0, exportUtils_1.styleTableBodyRow)(ws3, r3, 2, 8);
        ws3.getRow(r3).getCell(4).numFmt = "#,##0.00";
        ws3.getRow(r3).getCell(5).numFmt = "#,##0.00";
        ws3.getRow(r3).getCell(6).numFmt = "#,##0.00";
        ws3.getRow(r3).getCell(7).numFmt = "0.00%";
        ws3.getRow(r3).getCell(8).alignment = { wrapText: true, vertical: 'top' };
        r3++;
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
//# sourceMappingURL=stockReport.js.map