// functions/src/exports/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

import { buildStatementWorkbook } from './statement-engine';
import { buildClientStatement } from './builders/client';
import { buildSupplierStatement } from './builders/supplier';
import { buildExpensesStatement } from './builders/expenses';
import { buildProductMovementStatement } from './exports/productMovement';
import { exportStockReportExcel } from './exports/stockReport';
import { Currency } from './types';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

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

async function saveWorkbookAndSign(params: {
  companyId: string;
  filePath: string;
  buffer: Buffer;
}): Promise<{ downloadUrl: string; filePath: string }> {
  const file = bucket.file(params.filePath);

  // Firebase download token (works even if signBlob is denied)
  const token = randomUUID();

  await file.save(params.buffer, {
    resumable: false,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    metadata: {
      cacheControl: 'private, max-age=0, no-transform',
      // IMPORTANT: custom metadata map must be nested under "metadata"
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  // Build Firebase token download URL (no signing required)
  const encodedPath = encodeURIComponent(params.filePath);
  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

  return { downloadUrl, filePath: params.filePath };
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

// Allowed codes for HttpsError (defensive)
const ALLOWED_CODES = new Set([
  'cancelled',
  'unknown',
  'invalid-argument',
  'deadline-exceeded',
  'not-found',
  'already-exists',
  'permission-denied',
  'unauthenticated',
  'resource-exhausted',
  'failed-precondition',
  'aborted',
  'out-of-range',
  'unimplemented',
  'internal',
  'unavailable',
  'data-loss',
]);

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

      const { companyId, statementType, targetId, dateFrom, dateTo, locale } = data || {};
      if (!companyId || !statementType || !dateFrom || !dateTo) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'Missing companyId/statementType/dateFrom/dateTo.'
        );
      }

      const baseCurrency = await getCompanyBaseCurrency(companyId);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);

      if (statementType === 'client') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for client statement.');
        const { summary, rows } = await buildClientStatement({ companyId, clientId: targetId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
        const filename = `client_statement_${targetId}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath: `companies/${companyId}/exports/client/${targetId}/${filename}`, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings, filename };
      }

      if (statementType === 'supplier') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
        const { summary, rows } = await buildSupplierStatement({ companyId, supplierId: targetId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
        const filename = `supplier_statement_${targetId}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath: `companies/${companyId}/exports/supplier/${targetId}/${filename}`, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings, filename };
      }

      if (statementType === 'expenses') {
        const { summary, rows } = await buildExpensesStatement({ companyId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
        const filename = `expense_statement.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath: `companies/${companyId}/exports/expenses/all/${filename}`, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings, filename };
      }

      if (statementType === 'productMovement') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for product statement.');
        const { summary, rows } = await buildProductMovementStatement({ companyId, productId: targetId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency: summary.baseCurrency, locale });
        const filename = `product_statement_${targetId}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath: `companies/${companyId}/exports/product/${targetId}/${filename}`, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings, filename };
      }

      throw new functions.https.HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);
    } catch (err: any) {
      console.error('exportStatement failed:', { code: err?.code, message: err?.message, stack: err?.stack });
      if (isHttpsError(err)) throw err;
      if (looksLikeMissingIndex(err)) {
        throw new functions.https.HttpsError('failed-precondition', 'Firestore requires a composite index for this export. Deploy firestore indexes, then retry.', { originalCode: err?.code, originalMessage: String(err?.message || '') });
      }
      throw new functions.https.HttpsError(normalizeHttpsCode(err?.code), String(err?.message || 'Export failed (internal). Check logs.'), { originalCode: err?.code, originalMessage: String(err?.message || '') });
    }
  });


export const exportStockReport = functions.region('us-central1').https.onCall(async (req) => {
    const d = req.data;
    if (!d?.companyId || !d?.from || !d?.to || !d?.baseCurrency || !d?.stockMode) {
      throw new functions.https.HttpsError("invalid-argument", "Missing companyId/from/to/baseCurrency/stockMode");
    }
    const buf = await exportStockReportExcel(d);
    const filename = `stock_${d.stockMode}_${d.from}_${d.to}.xlsx`;
    const out = await saveWorkbookAndSign({ companyId: d.companyId, filePath: `companies/${d.companyId}/exports/stock/${filename}`, buffer: buf });
    return { downloadUrl: out.downloadUrl, filename };
});