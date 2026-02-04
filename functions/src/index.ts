// functions/src/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

import { exportClientStatementExcel } from './exports/clientStatement';
import { exportSupplierStatementExcel } from './exports/supplierStatement';
import { exportExpenseStatementExcel } from './exports/expenseStatement';
import { exportProductMovementExcel } from './exports/productMovement';
import { exportStockReportExcel } from "./exports/stockReport";

if (!admin.apps.length) {
  admin.initializeApp();
}

admin.firestore().settings({ ignoreUndefinedProperties: true });

function bufferToBase64(buf: Buffer) {
  return buf.toString('base64');
}

export const exportStatement = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '2GB' }) // Increased memory for safety
  .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth || (context.auth.token.role !== 'admin' && context.auth.token.role !== 'developer')) {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin or developer to export data.');
    }

    const d = data;

    // Payload validation
    if (!d?.companyId || !d?.statementType || !d?.dateFrom || !d?.dateTo) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields: companyId, statementType, dateFrom, dateTo.");
    }

    const companyId = String(d.companyId);
    const dateFrom = String(d.dateFrom);
    const dateTo = String(d.dateTo);
    const statementType = String(d.statementType);

    let buf: Buffer;
    let filename = `statement_${statementType}_${dateFrom}_${dateTo}.xlsx`;

    try {
        if (statementType === "client") {
            if (!d.clientId || !d.baseCurrency) throw new functions.https.HttpsError("invalid-argument", "Missing clientId/baseCurrency for client statement.");
            buf = await exportClientStatementExcel({
                companyId,
                clientId: String(d.clientId),
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `client_${d.clientId}_${dateFrom}_${dateTo}.xlsx`;
        } else if (statementType === "supplier") {
            if (!d.supplierId || !d.supplierName || !d.baseCurrency) {
                throw new functions.https.HttpsError("invalid-argument", "Missing supplierId/supplierName/baseCurrency for supplier statement.");
            }
            buf = await exportSupplierStatementExcel({
                companyId,
                supplierId: String(d.supplierId),
                supplierName: String(d.supplierName),
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `supplier_${d.supplierId}_${dateFrom}_${dateTo}.xlsx`;
        } else if (statementType === "expenses") {
            if (!d.baseCurrency) throw new functions.https.HttpsError("invalid-argument", "Missing baseCurrency for expense statement.");
            buf = await exportExpenseStatementExcel({
                companyId,
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `expenses_${dateFrom}_${dateTo}.xlsx`;
        } else if (statementType === "product") {
            if (!d.productCode) throw new functions.https.HttpsError("invalid-argument", "Missing productCode for product statement.");
            buf = await exportProductMovementExcel({
                companyId,
                productCode: String(d.productCode),
                from: dateFrom,
                to: dateTo,
            });
            filename = `product_${d.productCode}_${dateFrom}_${dateTo}.xlsx`;
        } else if (statementType === "stock") {
            if (!d.baseCurrency || !d.stockMode) throw new functions.https.HttpsError("invalid-argument", "Missing baseCurrency/stockMode for stock report.");
            buf = await exportStockReportExcel({
                companyId,
                baseCurrency: String(d.baseCurrency),
                stockMode: d.stockMode,
                from: dateFrom,
                to: dateTo,
            });
            filename = `stock_${d.stockMode}_${dateFrom}_${dateTo}.xlsx`;
        } else {
            throw new functions.https.HttpsError("invalid-argument", `Unknown statementType: ${statementType}`);
        }
    } catch (e: any) {
        console.error("Export generation failed:", e);
        throw e instanceof functions.https.HttpsError ? e : new functions.https.HttpsError("internal", e?.message || "Failed to generate the export file.");
    }
    
    return {
        filename,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: bufferToBase64(buf),
    };
});
