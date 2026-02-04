// functions/src/exports/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

import { buildStatementWorkbook } from './statement-engine';
import { buildClientStatement } from './builders/client';
import { buildSupplierStatement } from './builders/supplier';
import { buildExpensesStatement } from './builders/expenses';
import { buildProductMovementStatement } from './builders/product';
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

  // Add a Firebase Storage download token as a reliable fallback URL method
  const token = randomUUID();

  await file.save(params.buffer, {
    resumable: false,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    metadata: {
      cacheControl: 'private, max-age=0, no-transform',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });

  // Try signed URL first (short-lived)
  try {
    const [signed] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000,
    });
    return { downloadUrl: signed, filePath: params.filePath };
  } catch (e) {
    // Fallback: token URL (works even if signing is blocked)
    const bucketName = bucket.name;
    const encodedPath = encodeURIComponent(params.filePath);
    const tokenUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${token}`;
    return { downloadUrl: tokenUrl, filePath: params.filePath };
  }
}

/**
 * Generic dispatcher for your UI convenience.
 */
export const exportStatement = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    requireAdminOrDev(context);

    try {
      const { companyId, statementType, targetId, dateFrom, dateTo } = data || {};
      if (!companyId || !statementType || !dateFrom || !dateTo) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId/statementType/dateFrom/dateTo.');
      }

      const baseCurrency = await getCompanyBaseCurrency(companyId);
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid dateFrom/dateTo.');
      }

      if (statementType === 'client') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for client statement.');
        const { summary, rows } = await buildClientStatement({ companyId, clientId: targetId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency });
        const filePath = `companies/${companyId}/exports/client/${targetId}/client_statement_${Date.now()}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings };
      }

      if (statementType === 'supplier') {
        if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
        const { summary, rows } = await buildSupplierStatement({ companyId, supplierId: targetId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency });
        const filePath = `companies/${companyId}/exports/supplier/${targetId}/supplier_statement_${Date.now()}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings };
      }

      if (statementType === 'expenses') {
        const { summary, rows } = await buildExpensesStatement({ companyId, from, to, baseCurrency });
        const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency });
        const filePath = `companies/${companyId}/exports/expenses/all/expense_statement_${Date.now()}.xlsx`;
        const saved = await saveWorkbookAndSign({ companyId, filePath, buffer });
        return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings };
      }
      
      if (statementType === 'productMovement') {
          if (!targetId) throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for product statement.');
          const { summary, rows } = await buildProductMovementStatement({ companyId, productId: targetId, from, to, baseCurrency });
          const buffer = await buildStatementWorkbook({ summary, rows, baseCurrency: summary.baseCurrency });
          const filePath = `companies/${companyId}/exports/product/${targetId}/product_statement_${Date.now()}.xlsx`;
          const saved = await saveWorkbookAndSign({ companyId, filePath, buffer });
          return { success: true, downloadUrl: saved.downloadUrl, filePath: saved.filePath, warnings: summary.warnings };
      }

      throw new functions.https.HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);
    } catch (err: any) {
      console.error('exportStatement error:', err);

      // If it's already a proper HttpsError, just throw it
      if (err?.constructor?.name === 'HttpsError' || err?.code) {
        throw err;
      }

      // Convert unknown crash into visible message
      throw new functions.https.HttpsError(
        'internal',
        err?.message || 'Internal export error',
        { stack: err?.stack || null }
      );
    }
  });
