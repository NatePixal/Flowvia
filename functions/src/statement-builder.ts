// functions/src/statement-builder.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as ExcelJS from 'exceljs';
import { CURRENCY_DECIMALS } from './currency-config';
import { Currency, ClientLedgerEntry, DailyExpense, SupplierLedgerEntry } from './types';
import { fromMinor, toMinor } from './money';

const firestore = admin.firestore();
const storage = admin.storage();

interface StatementRow {
    date: Date;
    description: string;
    ref?: string;
    type: string;
    currency: Currency;
    debit: number; // original currency, major units
    credit: number; // original currency, major units
    debitBase: number;
    creditBase: number;
    fxRateToBase?: number;
    fxAsOfDate?: Date;
}

// Helper to safely convert Firestore Timestamps to JS Dates
function safeToDate(v: any): Date | null {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (v instanceof admin.firestore.Timestamp) return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

async function getClientStatementRows(companyId: string, targetId: string): Promise<StatementRow[]> {
    const ledgerSnap = await firestore.collection(`companies/${companyId}/clients/${targetId}/ledger`).get();
    return ledgerSnap.docs.map(doc => {
        const entry = doc.data() as ClientLedgerEntry;
        const date = safeToDate(entry.createdAt);
        if (!date) return null;

        const isPurchase = entry.type === 'purchase';
        const amount = fromMinor(entry.totalMinor, entry.currency);

        return {
            date,
            description: entry.note || (isPurchase ? 'Purchase' : 'Payment'),
            ref: entry.relatedSaleId || doc.id,
            type: entry.type,
            currency: entry.currency,
            debit: isPurchase ? amount : 0,
            credit: !isPurchase ? amount : 0,
            debitBase: 0, // Will be calculated later
            creditBase: 0, // Will be calculated later
        };
    }).filter((r): r is StatementRow => r !== null);
}

async function getExpenseStatementRows(companyId: string): Promise<StatementRow[]> {
    const expensesSnap = await firestore.collection(`companies/${companyId}/dailyExpenses`).get();
    return expensesSnap.docs.map(doc => {
        const entry = doc.data() as DailyExpense;
        const date = safeToDate(entry.date);
        if (!date) return null;

        return {
            date,
            description: entry.description || entry.expenseType,
            ref: doc.id,
            type: 'expense',
            currency: entry.currency,
            debit: fromMinor(entry.amountMinor ?? toMinor(entry.amount, entry.currency), entry.currency),
            credit: 0,
            debitBase: fromMinor(entry.amountBaseMinor ?? 0, entry.baseCurrency ?? 'USD'),
            creditBase: 0,
            fxRateToBase: entry.fx?.rateToBase,
            fxAsOfDate: safeToDate(entry.fx?.capturedAt) || undefined,
        };
    }).filter((r): r is StatementRow => r !== null);
}

// ... Implement getSupplierStatementRows and getInventoryStatementRows similarly

async function generateStatement(
    companyId: string,
    statementType: 'client' | 'supplier' | 'expenses' | 'inventory',
    targetId: string | undefined,
    dateFrom: Date,
    dateTo: Date
) {
    // 1. Get company info for base currency
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    if (!companySnap.exists) throw new Error('Company not found');
    const baseCurrency = companySnap.data()?.baseCurrency || 'USD';

    // 2. Fetch all relevant transactions for the entity
    let allRows: StatementRow[] = [];
    if (statementType === 'client' && targetId) {
        allRows = await getClientStatementRows(companyId, targetId);
    } else if (statementType === 'expenses') {
        allRows = await getExpenseStatementRows(companyId);
    }
    // ... add other statement types

    // 3. Separate transactions into "before" (for opening balance) and "in-range"
    const openingBalanceRows = allRows.filter(r => r.date < dateFrom);
    const statementRows = allRows.filter(r => r.date >= dateFrom && r.date <= dateTo)
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    // 4. Calculate opening balance in BASE currency
    let openingBalanceBase = 0;
    for (const row of openingBalanceRows) {
        // Here you would apply FX conversion logic for each row
        // For simplicity, we'll assume base amounts are already calculated for now
        openingBalanceBase += row.debitBase - row.creditBase;
    }

    // 5. Generate Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Statement');

    // -- Summary Section --
    sheet.mergeCells('A1:C1');
    sheet.getCell('A1').value = 'Statement Summary';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.addRow(['Period', `${dateFrom.toISOString().split('T')[0]} to ${dateTo.toISOString().split('T')[0]}`]);
    sheet.addRow(['Base Currency', baseCurrency]);
    sheet.addRow(['Opening Balance', { formula: `"${openingBalanceBase.toFixed(2)}"` }]);
    sheet.addRow([]); // Spacer

    // -- Statement Table Header --
    const headerRow = sheet.addRow([
        'Date', 'Description', 'Ref', 'Type', 'Currency',
        'Debit', 'Credit', 'Debit (Base)', 'Credit (Base)',
        'Running Balance (Base)'
    ]);
    headerRow.font = { bold: true };
    sheet.autoFilter = {
        from: 'A6',
        to: 'J6',
    };
    sheet.views = [{ state: 'frozen', ySplit: 6 }];

    // -- Statement Rows --
    let runningBalance = openingBalanceBase;
    statementRows.forEach((row, index) => {
        runningBalance += row.debitBase - row.creditBase;
        sheet.addRow([
            row.date,
            row.description,
            row.ref,
            row.type,
            row.currency,
            row.debit,
            row.credit,
            row.debitBase,
            row.creditBase,
            runningBalance
        ]);
        const rowNumber = 7 + index;
        sheet.getCell(`F${rowNumber}`).numFmt = '#,##0.00';
        sheet.getCell(`G${rowNumber}`).numFmt = '#,##0.00';
        sheet.getCell(`H${rowNumber}`).numFmt = '#,##0.00';
        sheet.getCell(`I${rowNumber}`).numFmt = '#,##0.00';
        sheet.getCell(`J${rowNumber}`).numFmt = '#,##0.00';
    });

    // 6. Upload to Storage
    const bucket = storage.bucket();
    const fileName = `statements/${companyId}/${statementType}_${targetId || ''}_${Date.now()}.xlsx`;
    const file = bucket.file(fileName);
    const buffer = await workbook.xlsx.writeBuffer();

    await file.save(buffer, {
        metadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    });

    // 7. Get Signed URL
    const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 5, // 5 minutes
    });

    return url;
}

export const exportStatement = functions.https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'admin' && context.auth.token.role !== 'developer')) {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin or developer to export statements.');
    }

    const { companyId, statementType, targetId, dateFrom, dateTo } = data;
    if (!companyId || !statementType || !dateFrom || !dateTo) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters.');
    }

    try {
        const downloadUrl = await generateStatement(
            companyId,
            statementType,
            targetId,
            new Date(dateFrom),
            new Date(dateTo)
        );
        return { success: true, downloadUrl };
    } catch (err: any) {
        console.error("Statement generation failed:", err);
        throw new functions.https.HttpsError('internal', err.message || 'An unknown error occurred.');
    }
});
