// functions/src/exports/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

import { buildStatementWorkbook } from './statement-engine';
import { buildClientStatement } from './builders/client';
import { buildSupplierStatement } from './builders/supplier';
import { buildExpensesStatement } from './builders/expenses';
import { buildProductMovementStatement } from './builders/product';
import { exportStockReportExcel } from './stockReport';
import { Currency } from './types';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function requireAdminOrDev(context: functions.https.CallableContext) {
  const role = context.auth?.token?.role;
  if (!context.auth || (role !== 'admin' && role !== 'developer')) {
    throw new functions.https.HttpsError('permission-denied', 'Admin/Developer required.');
  }
}

async function getCompanyBaseCurrency(companyId: string): Promise<Currency> {
  const snap = await db.doc(`companies/${companyId}`).get();
  const base = (snap.data() as any)?.baseCurrency;
  return (base || 'USD') as Currency;
}

function bufferToBase64(buf: Buffer) {
  return buf.toString('base64');
}


// --- helpers for deterministic error surfacing ---
function isHttpsError(err: any): err is functions.https.HttpsError {
  return err instanceof functions.https.HttpsError || err?.constructor?.name === 'HttpsError';
}

function looksLikeMissingIndex(err: any): boolean {
  const msg = String(err?.message || '');
  // Covers: "The query requires an index. You can create it here: ..."
  return /requires an index|create.*index|create_composite/i.test(msg);
}

const ALLOWED_CODES = new Set(['cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists', 'permission-denied', 'unauthenticated', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range', 'unimplemented', 'internal', 'unavailable', 'data-loss']);

function normalizeHttpsCode(code: any): functions.https.FunctionsErrorCode {
  const c = typeof code === 'string' ? code : '';
  return (ALLOWED_CODES.has(c) ? c : 'internal') as functions.https.FunctionsErrorCode;
}

/**
 * Generic dispatcher for your UI convenience.
 */
export const exportStatement = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    try {
      requireAdminOrDev(context);

      const { companyId, statementType, targetId, dateFrom, dateTo, locale, stockMode } = data || {};
      
      if (!companyId || !statementType || !dateFrom || !dateTo) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId/statementType/dateFrom/dateTo.');
      }

      const baseCurrency = await getCompanyBaseCurrency(companyId);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      
      let buf: Buffer;
      let filename: string;

      if (statementType === 'client') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for client statement.');
        const { summary, rows } = await buildClientStatement({ companyId, clientId: targetId, from, to, baseCurrency });
        buf = await buildStatementWorkbook({ summary, rows, baseCurrency });
        filename = `client_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
        return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
      }

      if (statementType === 'supplier') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
        const { summary, rows } = await buildSupplierStatement({ companyId, supplierId: targetId, from, to, baseCurrency });
        buf = await buildStatementWorkbook({ summary, rows, baseCurrency });
        filename = `supplier_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
        return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
      }

      if (statementType === 'expenses') {
        const { summary, rows } = await buildExpensesStatement({ companyId, from, to, baseCurrency });
        buf = await buildStatementWorkbook({ summary, rows, baseCurrency });
        filename = `expense_statement_${dateFrom}_${dateTo}.xlsx`;
        return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
      }

      if (statementType === 'productMovement') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for product statement.');
        const { summary, rows } = await buildProductMovementStatement({ companyId, productId: targetId, from, to, baseCurrency });
        buf = await buildStatementWorkbook({ summary, rows, baseCurrency: summary.baseCurrency });
        filename = `product_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
        return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
      }

      if (statementType === 'stockReport' || statementType === 'stock') {
        if (!stockMode) throw new functions.https.HttpsError('invalid-argument', 'Missing stockMode for stock report.');
        buf = await exportStockReportExcel({ companyId, from: dateFrom, to: dateTo, baseCurrency, stockMode });
        filename = `stock_report_${stockMode}_${dateFrom}_${dateTo}.xlsx`;
        return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf) };
      }
      
      throw new functions.https.HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);

    } catch (err: any) {
      console.error('exportStatement failed:', { code: err?.code, message: err?.message, stack: err?.stack });
      if (isHttpsError(err)) throw err;
      if (looksLikeMissingIndex(err)) {
        throw new functions.https.HttpsError('failed-precondition', 'Firestore requires a composite index for this export (or the index is still building). Deploy firestore indexes, then retry.', { originalCode: err?.code, originalMessage: String(err?.message || '') });
      }
      throw new functions.https.HttpsError(normalizeHttpsCode(err?.code), String(err?.message || 'Export failed (internal). Check Cloud Functions logs.'), { originalCode: err?.code, originalMessage: String(err?.message || '') });
    }
  });