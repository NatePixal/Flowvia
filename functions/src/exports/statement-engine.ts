// functions/src/exports/statement-engine.ts
import * as ExcelJS from 'exceljs';
import { excelNumFmtForCurrency } from './money';
import { StatementRow, StatementSummary } from './types';

// --- 1. LOCAL, EXCEL-ONLY TRANSLATIONS ---
const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    businessDate: "Business Date",
    description: "Description",
    type: "Type",
    currency: "Currency",
    debitOrig: "Debit (Orig)",
    creditOrig: "Credit (Orig)",
    runningBase: "Running Bal ({baseCurrency})",
    reference: "Reference",
    fxStatus: "FX Status",
    reportTitle: "Report",
    period: "Period",
    baseCurrency: "Base Currency",
    noData: "No data available for the selected period.",
    clientTitle: "Client Statement",
    supplierTitle: "Supplier Statement",
    expensesTitle: "Expense Statement",
    productMovementTitle: "Product Movement",
    stockReportTitle: "Inventory Stock Report",
    category: "Category",
    amount: "Amount",
    fxPair: "FX Pair",
    fxRate: "FX Rate",
    amountBase: "Amount ({baseCurrency})",
    paidTo: "Paid To",
    employee: "Employee",
    createdBy: "Created By",
    qtyIn: "Qty In",
    qtyOut: "Qty Out",
    runningQty: "Running Qty",
  },
  ru: {
    businessDate: "Рабочая дата",
    description: "Описание",
    type: "Тип",
    currency: "Валюта",
    debitOrig: "Дебет (ориг.)",
    creditOrig: "Кредит (ориг.)",
    runningBase: "Остаток ({baseCurrency})",
    reference: "Ссылка",
    fxStatus: "Статус FX",
    reportTitle: "Отчет",
    period: "Период",
    baseCurrency: "Базовая валюта",
    noData: "Нет данных за выбранный период.",
    clientTitle: "Выписка по клиенту",
    supplierTitle: "Выписка по поставщику",
    expensesTitle: "Отчет о расходах",
    productMovementTitle: "Движение товара",
    stockReportTitle: "Отчет по складу",
    category: "Категория",
    amount: "Сумма",
    fxPair: "Валютная пара",
    fxRate: "Курс",
    amountBase: "Сумма ({baseCurrency})",
    paidTo: "Получатель",
    employee: "Сотрудник",
    createdBy: "Создал",
    qtyIn: "Кол-во (приход)",
    qtyOut: "Кол-во (расход)",
    runningQty: "Остаток (кол-во)",
  },
  uz: {
    businessDate: "Ish kuni",
    description: "Tavsif",
    type: "Turi",
    currency: "Valyuta",
    debitOrig: "Debet (asl)",
    creditOrig: "Kredit (asl)",
    runningBase: "Qoldiq ({baseCurrency})",
    reference: "Manba",
    fxStatus: "Valyuta holati",
    reportTitle: "Hisobot",
    period: "Davr",
    baseCurrency: "Asosiy valyuta",
    noData: "Tanlangan davr uchun ma'lumotlar mavjud emas.",
    clientTitle: "Mijoz hisoboti",
    supplierTitle: "Yetkazib beruvchi hisoboti",
    expensesTitle: "Xarajatlar hisoboti",
    productMovementTitle: "Mahsulot harakati",
    stockReportTitle: "Ombor hisoboti",
    category: "Kategoriya",
    amount: "Summa",
    fxPair: "Valyuta juftligi",
    fxRate: "Kurs",
    amountBase: "Summa ({baseCurrency})",
    paidTo: "To'lovchi",
    employee: "Xodim",
    createdBy: "Yaratdi",
    qtyIn: "Miqdor (kirim)",
    qtyOut: "Miqdor (chiqim)",
    runningQty: "Qoldiq (miqdor)",
  },
  ar: {
    businessDate: "تاريخ العمل",
    description: "الوصف",
    type: "النوع",
    currency: "العملة",
    debitOrig: "مدين (أصلي)",
    creditOrig: "دائن (أصلي)",
    runningBase: "الرصيد الجاري ({baseCurrency})",
    reference: "مرجع",
    fxStatus: "حالة الصرف",
    reportTitle: "تقرير",
    period: "فترة",
    baseCurrency: "العملة الأساسية",
    noData: "لا توجد بيانات متاحة للفترة المحددة.",
    clientTitle: "كشف حساب العميل",
    supplierTitle: "كشف حساب المورد",
    expensesTitle: "تقرير المصروفات",
    productMovementTitle: "حركة المنتج",
    stockReportTitle: "تقرير المخزون",
    category: "الفئة",
    amount: "المبلغ",
    fxPair: "زوج العملات",
    fxRate: "سعر الصرف",
    amountBase: "المبلغ ({baseCurrency})",
    paidTo: "دفع لـ",
    employee: "الموظف",
    createdBy: "تم إنشاؤه بواسطة",
    qtyIn: "الكمية الواردة",
    qtyOut: "الكمية الصادرة",
    runningQty: "الكمية المتبقية",
  },
};

function t(locale: string, key: string, params?: Record<string, string>): string {
  const lang = TRANSLATIONS[locale] || TRANSLATIONS.en;
  let text = lang[key] || TRANSLATIONS.en[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, v);
    }
  }
  return text;
}

function statementTitle(locale: string, statementType: string): string {
    const key = `${statementType}Title`;
    return t(locale, key, {});
}

// --- 2. REPORT-AWARE COLUMN DEFINITIONS ---
type ColumnDefinition = { headerKey: string; dataKey: keyof StatementRow | `meta.${string}`; width: number; kind: string; align?: 'left' | 'right' | 'center' };

function getLocalizedColumns(locale: string, baseCurrency: string, statementType: string): ColumnDefinition[] {
    const commonLedgerCols: ColumnDefinition[] = [
        { headerKey: "businessDate", dataKey: "businessDate", width: 14, kind: "date", align: "left" },
        { headerKey: "description", dataKey: "description", width: 40, kind: "text", align: "left" },
        { headerKey: "type", dataKey: "type", width: 14, kind: "text", align: "left" },
        { headerKey: "currency", dataKey: "currency", width: 10, kind: "text", align: "center" },
        { headerKey: "debitOrig", dataKey: "debitOrig", width: 16, kind: "moneyOrig", align: "right" },
        { headerKey: "creditOrig", dataKey: "creditOrig", width: 16, kind: "moneyOrig", align: "right" },
        { headerKey: "runningBase", dataKey: "runningBase", width: 18, kind: "moneyBase", align: "right" },
        { headerKey: "reference", dataKey: "reference", width: 24, kind: "text", align: "left" },
    ];
    if (statementType === 'client' || statementType === 'supplier') {
        return commonLedgerCols;
    }
    if (statementType === 'productMovement') {
        return [
            { headerKey: "businessDate", dataKey: "businessDate", width: 14, kind: "date", align: "left" },
            { headerKey: "description", dataKey: "description", width: 45, kind: "text", align: "left" },
            { headerKey: "type", dataKey: "type", width: 16, kind: "text", align: "left" },
            { headerKey: "qtyIn", dataKey: "debitOrig", width: 15, kind: "qty", align: "right" },
            { headerKey: "qtyOut", dataKey: "creditOrig", width: 15, kind: "qty", align: "right" },
            { headerKey: "runningQty", dataKey: "runningBase", width: 18, kind: "qty", align: "right" },
            { headerKey: "reference", dataKey: "reference", width: 24, kind: "text", align: "left" },
        ];
    }
    if (statementType === 'expenses') {
        return [
            { headerKey: "businessDate", dataKey: "businessDate", width: 14, kind: "date", align: "left" },
            { headerKey: "category", dataKey: "meta.category", width: 18, kind: "text", align: "left" },
            { headerKey: "description", dataKey: "description", width: 40, kind: "text", align: "left" },
            { headerKey: "amount", dataKey: "meta.amountOrig", width: 16, kind: "moneyOrig", align: "right" },
            { headerKey: "currency", dataKey: "currency", width: 10, kind: "text", align: "center" },
            { headerKey: "fxRate", dataKey: "meta.fxEnteredRate", width: 14, kind: "number", align: "right" },
            { headerKey: "amountBase", dataKey: "meta.amountBase", width: 18, kind: "moneyBase", align: "right" },
            { headerKey: "paidTo", dataKey: "meta.paidTo", width: 22, kind: "text", align: "left" },
            { headerKey: "employee", dataKey: "meta.employee", width: 22, kind: "text", align: "left" },
            { headerKey: "createdBy", dataKey: "meta.createdBy", width: 22, kind: "text", align: "left" },
            { headerKey: "reference", dataKey: "reference", width: 24, kind: "text", align: "left" },
        ];
    }
    return commonLedgerCols; // Default
}

// --- UTILITY FUNCTIONS ---
function safeNumFmt(currency: string): string {
    if (currency === 'QTY') return '#,##0.00';
    try {
        return excelNumFmtForCurrency(currency) || '#,##0.00';
    } catch {
        return '#,##0.00';
    }
}

function isoDate(d?: Date | null): Date | null {
    if (!d) return null;
    return d instanceof Date ? d : null;
}

function getRowValue(row: StatementRow, key: string): any {
    if (key.startsWith('meta.')) {
        const metaKey = key.substring(5);
        return row.meta?.[metaKey] ?? null;
    }
    return row[key as keyof StatementRow] ?? null;
}

// --- 3. MAIN WORKBOOK BUILDER ---
export async function buildStatementWorkbook(params: {
  summary: StatementSummary;
  rows: StatementRow[];
  baseCurrency: string;
  locale?: string;
  statementType?: string;
}): Promise<Buffer> {
    const { summary, rows, baseCurrency, statementType = "ledger" } = params;
    const locale = params.locale || 'en';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FlowVia';
    wb.created = new Date();

    const sh = wb.addWorksheet('Statement');

    // --- RTL Support ---
    if (locale === 'ar') {
        sh.views = [{ rightToLeft: true, state: 'frozen', ySplit: 6 }];
    } else {
        sh.views = [{ state: 'frozen', ySplit: 6 }];
    }

    // --- Header Section ---
    sh.mergeCells('A1:M1');
    sh.getCell('A1').value = "FlowVia Business Solutions";
    sh.getCell('A1').font = { name: 'Arial', size: 16, bold: true };
    sh.getCell('A1').alignment = { horizontal: locale === 'ar' ? 'right' : 'left' };

    sh.mergeCells('A2:M2');
    sh.getCell('A2').value = statementTitle(locale, statementType);
    sh.getCell('A2').font = { name: 'Arial', size: 14, bold: true };
    sh.getCell('A2').alignment = { horizontal: locale === 'ar' ? 'right' : 'left' };

    sh.getCell('A4').value = `${t(locale, 'period')}: ${summary.periodFrom.toISOString().slice(0, 10)} → ${summary.periodTo.toISOString().slice(0, 10)}`;
    sh.getCell('A4').font = { bold: true };
    sh.getCell('A5').value = `${t(locale, 'baseCurrency')}: ${summary.baseCurrency}`;
    sh.getCell('A5').font = { bold: true };
    
    // --- Column Setup & Headers ---
    const columns = getLocalizedColumns(locale, baseCurrency, statementType);
    sh.columns = columns.map(c => ({ 
        header: t(locale, c.headerKey, { baseCurrency }), 
        key: c.dataKey, 
        width: c.width 
    }));
    
    const headerRow = sh.getRow(6);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F7' } };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
    });

    // --- Data Rows ---
    if (rows.length === 0) {
        const colsCount = columns.length;
        if (colsCount > 0) {
            sh.mergeCells(7, 1, 7, colsCount);
            const noDataCell = sh.getCell(7, 1);
            noDataCell.value = t(locale, 'noData');
            noDataCell.alignment = { horizontal: 'center', vertical: 'middle' };
            noDataCell.font = { italic: true, color: { argb: 'FF6B7280' } };
        }
    } else {
        rows.forEach((r) => {
            const rowObj: Record<string, any> = {};
            columns.forEach(c => {
                rowObj[c.dataKey] = getRowValue(r, c.dataKey);
            });
            const addedRow = sh.addRow(rowObj);

            addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const colDef = columns[colNumber - 1];
                if (!colDef) return;

                cell.alignment = { vertical: 'middle', horizontal: colDef.align || 'left', wrapText: true };
                
                if (colDef.kind === 'date') cell.numFmt = 'yyyy-mm-dd';
                if (colDef.kind === 'moneyOrig') cell.numFmt = safeNumFmt(r.currency || baseCurrency);
                if (colDef.kind === 'moneyBase') cell.numFmt = safeNumFmt(baseCurrency);
                if (colDef.kind === 'qty') cell.numFmt = '#,##0.00';
                if (colDef.kind === 'number' && typeof cell.value === 'number') cell.numFmt = '0.00####';

                if (r.fxStatus === 'MISSING' && ['moneyBase', 'runningBase'].includes(colDef.kind)) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
                    cell.font = { color: { argb: 'FF991B1B' } };
                }
            });
        });
    }

    sh.autoFilter = {
        from: { row: 6, column: 1 },
        to: { row: 6, column: columns.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}
