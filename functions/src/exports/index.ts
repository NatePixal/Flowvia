// functions/src/exports/index.ts

import * as functions from 'firebase-functions/v1';
import { HttpsError } from 'firebase-functions/v1/https';
import * as admin from 'firebase-admin';
import { buildStatementWorkbook } from './statement-engine';
import { buildClientStatement } from './builders/client';
import { buildSupplierStatement } from './builders/supplier';
import { buildExpensesStatement } from './builders/expenses';
import { buildProductMovementStatement } from './builders/product';
import { exportStockReportExcel } from './stockReport';
import type { Currency, Company } from '../types';

function requireAdminOrDev(auth: functions.https.CallableContext['auth']) {
  const role = auth?.token?.role;
  if (!auth || (role !== 'admin' && role !== 'developer')) {
    throw new HttpsError('permission-denied', 'Admin/Developer required.');
  }
}

async function getCompanyBaseCurrency(companyId: string): Promise<Currency> {
  const snap = await admin.firestore().doc(`companies/${companyId}`).get();
  const base = (snap.data() as Company)?.baseCurrency;
  return (base || 'USD') as Currency;
}

function bufferToBase64(buf: Buffer) {
  return buf.toString('base64');
}

export const exportStatement = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    try {
        requireAdminOrDev(context.auth);

        const { companyId, statementType, targetId, dateFrom, dateTo, locale, stockMode } = data || {};
        if (!companyId || !statementType || !dateFrom || !dateTo) {
            throw new HttpsError('invalid-argument', 'Missing companyId/statementType/dateFrom/dateTo.');
        }

        const baseCurrency = await getCompanyBaseCurrency(companyId);
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        
        let buf: Buffer;
        let filename: string;

        if (statementType === 'client') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for client statement.');
            const { summary, rows } = await buildClientStatement({ companyId, clientId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ statementType: 'client', summary, rows, baseCurrency, locale });
            filename = `client_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'supplier') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
            const { summary, rows } = await buildSupplierStatement({ companyId, supplierId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ statementType: 'supplier', summary, rows, baseCurrency, locale });
            filename = `supplier_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'expenses') {
            const { summary, rows } = await buildExpensesStatement({ companyId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ statementType: 'expenses', summary, rows, baseCurrency, locale });
            filename = `expense_statement_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'productMovement') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for product statement.');
            const { summary, rows } = await buildProductMovementStatement({ companyId, productId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ statementType: 'productMovement', summary, rows, baseCurrency: summary.baseCurrency, locale });
            filename = `product_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === "stockReport") {
            if (!stockMode) throw new HttpsError('invalid-argument', 'Missing stockMode for stock report.');
            const xlsxBuffer = await exportStockReportExcel({
                companyId,
                from: dateFrom,
                to: dateTo,
                baseCurrency,
                stockMode
            });
            
            return {
                base64: xlsxBuffer.toString("base64"),
                filename: `stock-report-${stockMode}-${companyId}-${dateFrom}-${dateTo}.xlsx`,
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            };
        }
        
        throw new HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);

    } catch (err: any) {
        console.error('exportStatement failed:', { code: err?.code, message: err?.message, stack: err?.stack });
        if (err instanceof HttpsError) throw err;
        throw new HttpsError('internal', String(err.message || 'Export failed (internal). Check Cloud Functions logs.'), { originalCode: err?.code, originalMessage: String((err?.message) || '') });
    }
});
