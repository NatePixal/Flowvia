// functions/src/exports/stockReport.ts
import * as admin from "firebase-admin";
import * as ExcelJS from "exceljs";
import {
  applyGlobalWorkbookStyle,
  makeDateRange,
  setSheetPrintDefaults,
  styleTitle,
  styleInfoRow,
  styleTableHeader,
  styleTableBodyRow,
} from "./exportUtils";
import { minorToMajor } from "./money";
import type { Product } from "../types";

type StockMode = "range" | "asOfToday" | "both";
type Locale = 'en' | 'ru' | 'uz' | 'ar';

type ExportStockInput = {
  companyId: string;
  from: string;
  to: string;
  baseCurrency: string;
  stockMode: StockMode;
  locale?: string;
};

type Agg = {
  productCode: string;
  incomingBefore: number;
  incomingRange: number;
  incomingAll: number;
  soldBefore: number;
  soldRange: number;
  soldAll: number;
  revenueRangeBaseMinor: number;
  profitRangeBaseMinor: number;
};

const TRANSLATIONS: Record<string, Record<string, string>> = {
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

function t(locale: string | undefined, key: string): string {
    const lang = TRANSLATIONS[locale || 'en'] || TRANSLATIONS.en;
    return lang[key] || TRANSLATIONS.en[key] || key;
}

function anyToMillis(v: any): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") {
    const d: Date = v.toDate();
    return d?.getTime?.() ?? null;
  }
  return null;
}

function anyToISODate(v: any): string {
  if (!v) return "";
  const d: Date = v instanceof Date ? v : typeof v.toDate === "function" ? v.toDate() : new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

export async function exportStockReportExcel(input: ExportStockInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);
  const locale = input.locale || 'en';

  const agg = new Map<string, Agg>();

  function get(code: string): Agg {
    if (!agg.has(code)) {
      agg.set(code, {
        productCode: code,
        incomingBefore: 0, incomingRange: 0, incomingAll: 0,
        soldBefore: 0, soldRange: 0, soldAll: 0,
        revenueRangeBaseMinor: 0, profitRangeBaseMinor: 0,
      });
    }
    return agg.get(code)!;
  }

  const incAllSnap = await db.collection("companies").doc(input.companyId).collection("incomingProducts").get();
  for (const d of incAllSnap.docs) {
    const x = d.data();
    const code = String(x.productCode ?? "");
    if (!code) continue;
    const q = Number(x.quantity ?? 0);
    get(code).incomingAll += q;
    const dt = x.incomeDate ?? x.date;
    const ms = anyToMillis(dt);
    if (ms != null) {
      if (ms < range.from.getTime()) get(code).incomingBefore += q;
      if (ms >= range.from.getTime() && ms < range.toExclusive.getTime()) get(code).incomingRange += q;
    }
  }

  const salesAllSnap = await db.collection("companies").doc(input.companyId).collection("sales").get();
  const salesByDay = new Map<
    string,
    { units: number; revenueMinor: number; profitMinor: number; products: Map<string, number> }
  >();

  for (const d of salesAllSnap.docs) {
    const s = d.data();
    const code = String(s.productCode ?? "");
    if (!code) continue;
    const q = Number(s.quantity ?? 0);
    get(code).soldAll += q;
    const dt = s.date;
    const ms = anyToMillis(dt);
    if (ms != null) {
      if (ms < range.from.getTime()) get(code).soldBefore += q;
      if (ms >= range.from.getTime() && ms < range.toExclusive.getTime()) {
        get(code).soldRange += q;
        get(code).revenueRangeBaseMinor += Number(s.revenueBaseMinor ?? 0);
        get(code).profitRangeBaseMinor += Number(s.grossProfitBaseMinor ?? 0);
        
        const day = anyToISODate(dt);
        if (!salesByDay.has(day)) {
          salesByDay.set(day, { units: 0, revenueMinor: 0, profitMinor: 0, products: new Map() });
        }
        const bucket = salesByDay.get(day)!;

        bucket.units += q;
        bucket.revenueMinor += Number(s.revenueBaseMinor ?? 0);
        bucket.profitMinor += Number(s.grossProfitBaseMinor ?? 0);
        bucket.products.set(code, (bucket.products.get(code) || 0) + q);
      }
    }
  }
  
  const productNameByCode = new Map<string, string>();
  const productsByCode = new Map<string, Product>();
  try {
    const prodSnap = await db.collection("companies").doc(input.companyId).collection("products").get();
    for (const d of prodSnap.docs) {
        const p = d.data() as Product;
        const code = String(p.productCode ?? p.id ?? "");
        if (code) {
            productsByCode.set(code, p);
            productNameByCode.set(code, p.name);
        }
    }
  } catch { /* ignore */ }
  
  const rows = Array.from(agg.values()).map(a => {
    const opening = a.incomingBefore - a.soldBefore;
    const closing = opening + a.incomingRange - a.soldRange;
    const onHandToday = a.incomingAll - a.soldAll;
    const remainingQty = input.stockMode === "range" ? closing : onHandToday;

    const productDoc = productsByCode.get(a.productCode);
    let priceOrigin: number | string = "";
    if (productDoc) {
      const p: any = productDoc;
      const purchasePriceMinor = p.purchasePriceMinor ?? p.costMinor ?? p.avgCostMinor ?? p.averageCostMinor;
      if (typeof purchasePriceMinor === 'number') {
          priceOrigin = minorToMajor(purchasePriceMinor, (p.purchasePriceCurrency || input.baseCurrency));
      } else {
          const purchasePriceMajor = p.purchasePrice ?? p.cost ?? p.avgCost ?? p.averageCost;
          if (typeof purchasePriceMajor === 'number') priceOrigin = purchasePriceMajor;
      }
    }
    if (priceOrigin === "" && a.soldRange > 0 && a.revenueRangeBaseMinor > 0) {
        const costOfGoodsSold = a.revenueRangeBaseMinor - a.profitRangeBaseMinor;
        priceOrigin = minorToMajor(costOfGoodsSold, input.baseCurrency) / a.soldRange;
    }

    return {
      code: a.productCode,
      name: productNameByCode.get(a.productCode) ?? "",
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
  applyGlobalWorkbookStyle(wb);
  const isRTL = locale === 'ar';

  // ===== Sheet 1: Stock Summary =====
  const ws = wb.addWorksheet(t(locale, 'sheet_summary'));
  if (isRTL) ws.views = [{ rightToLeft: true }];
  setSheetPrintDefaults(ws);
  ws.columns = [
      { width: 2 }, { width: 16 }, { width: 26 }, { width: 12 }, { width: 13 },
      { width: 13 }, { width: 16 }, { width: 13 }, { width: 16 }, { width: 13 },
  ];
  styleTitle(ws, t(locale, 'title_summary'), t(locale, 'company'));
  if (isRTL) { ws.getCell('B2').alignment = { horizontal: 'right' }; ws.getCell('B3').alignment = { horizontal: 'right' }; }
  styleInfoRow(ws, 5, t(locale, 'info_mode'), input.stockMode);
  styleInfoRow(ws, 6, t(locale, 'info_currency'), input.baseCurrency);
  styleInfoRow(ws, 7, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
  if (isRTL) { ws.getCell('B5').alignment = { horizontal: 'right' }; ws.getCell('B6').alignment = { horizontal: 'right' }; ws.getCell('B7').alignment = { horizontal: 'right' }; }

  const hr1 = 12;
  ws.getRow(hr1).values = ["", t(locale, 'h_prod_code'), t(locale, 'h_prod_name'), t(locale, 'h_opening'), t(locale, 'h_incoming'), t(locale, 'h_sold'), t(locale, 'h_remaining'), t(locale, 'h_origin_price'), t(locale, 'h_revenue'), t(locale, 'h_profit')];
  styleTableHeader(ws, hr1, 2, 10);
  ws.autoFilter = { from: { row: hr1, column: 2 }, to: { row: hr1, column: 10 }};
  (ws as any).views = [{ state: 'frozen', ySplit: hr1, rightToLeft: isRTL }];

  let r1 = hr1 + 1;
  for (const x of rows) {
    ws.getRow(r1).values = ["", x.code, x.name, input.stockMode === "asOfToday" ? "" : x.opening, input.stockMode === "asOfToday" ? "" : x.incoming, input.stockMode === "asOfToday" ? "" : x.sold, x.remainingQty, x.priceOrigin, minorToMajor(x.revenue, input.baseCurrency), minorToMajor(x.profit, input.baseCurrency)];
    styleTableBodyRow(ws, r1, 2, 10);
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
  if (isRTL) ws2.views = [{ rightToLeft: true }];
  setSheetPrintDefaults(ws2);
  ws2.columns = [{ width: 2 }, { width: 16 }, { width: 26 }, { width: 12 }, { width: 16 }, { width: 23.4 }, { width: 18.3 }, { width: 16 }];
  styleTitle(ws2, t(locale, 'title_demand'), t(locale, 'company'));
  if (isRTL) { ws2.getCell('B2').alignment = { horizontal: 'right' }; ws2.getCell('B3').alignment = { horizontal: 'right' }; }
  styleInfoRow(ws2, 5, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
  if (isRTL) { ws2.getCell('B5').alignment = { horizontal: 'right' }; }

  const hr2 = 12;
  ws2.getRow(hr2).values = ["", t(locale, 'h_prod_code'), t(locale, 'h_prod_name'), t(locale, 'h_units_sold'), t(locale, 'h_revenue'), t(locale, 'h_profit'), t(locale, 'h_profit_pct'), t(locale, 'h_avg_price')];
  styleTableHeader(ws2, hr2, 2, 8);
  ws2.autoFilter = { from: { row: hr2, column: 2 }, to: { row: hr2, column: 8 }};
  (ws2 as any).views = [{ state: 'frozen', ySplit: hr2, rightToLeft: isRTL }];

  let r2 = hr2 + 1;
  const demand = [...rows].sort((a, b) => (b.sold - a.sold));
  for (const x of demand) {
    const revenue = minorToMajor(x.revenue, input.baseCurrency);
    const profit = minorToMajor(x.profit, input.baseCurrency);
    const gpPct = revenue > 0 ? profit / revenue : 0;
    const avgSellPrice = x.sold > 0 ? revenue / x.sold : 0;
    ws2.getRow(r2).values = ["", x.code, x.name, x.sold, revenue, profit, gpPct, avgSellPrice];
    styleTableBodyRow(ws2, r2, 2, 8);
    ws2.getRow(r2).getCell(5).numFmt = "#,##0.00";
    ws2.getRow(r2).getCell(6).numFmt = "#,##0.00";
    ws2.getRow(r2).getCell(7).numFmt = "0.00%";
    ws2.getRow(r2).getCell(8).numFmt = "#,##0.00";
    r2++;
  }

  // ===== Sheet 3: Sales by Day =====
  const ws3 = wb.addWorksheet(t(locale, 'sheet_daily'));
  if (isRTL) ws3.views = [{ rightToLeft: true }];
  setSheetPrintDefaults(ws3);
  ws3.columns = [{ width: 2 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 16 }, { width: 23 }, { width: 19 }, { width: 44 }];
  styleTitle(ws3, t(locale, 'title_daily'), t(locale, 'company'));
  if (isRTL) { ws3.getCell('B2').alignment = { horizontal: 'right' }; ws3.getCell('B3').alignment = { horizontal: 'right' }; }
  styleInfoRow(ws3, 5, t(locale, 'info_period'), `From ${input.from} to ${input.to}`);
  if (isRTL) { ws3.getCell('B5').alignment = { horizontal: 'right' }; }

  const hr3 = 12;
  ws3.getRow(hr3).values = ["", t(locale, 'h_date'), t(locale, 'h_units_sold'), t(locale, 'h_origin_price'), t(locale, 'h_revenue'), t(locale, 'h_profit'), t(locale, 'h_profit_pct'), t(locale, 'h_products_sold')];
  styleTableHeader(ws3, hr3, 2, 8);
  ws3.autoFilter = { from: { row: hr3, column: 2 }, to: { row: hr3, column: 8 }};
  (ws3 as any).views = [{ state: 'frozen', ySplit: hr3, rightToLeft: isRTL }];

  let r3 = hr3 + 1;
  const daily = Array.from(salesByDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([day, v]) => ({ day, ...v }));
  for (const d of daily) {
    const units = d.units;
    const revenue = minorToMajor(d.revenueMinor, input.baseCurrency);
    const profit = minorToMajor(d.profitMinor, input.baseCurrency);
    const priceOrigin = units > 0 ? (revenue - profit) / units : 0;
    const gpPct = revenue > 0 ? profit / revenue : 0;
    
    const productsSold = Array.from(d.products.entries())
      .sort((a, b) => b[1] - a[1]) // sort by qty desc
      .map(([code, qty]) => `${productNameByCode.get(code) ?? code} (${qty})`)
      .join(', ');

    ws3.getRow(r3).values = ["", d.day, units, priceOrigin, revenue, profit, gpPct, productsSold];
    styleTableBodyRow(ws3, r3, 2, 8);
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
