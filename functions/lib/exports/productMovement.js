"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStatement = void 0;
// functions/src/exports/index.ts
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const statement_engine_1 = require("./statement-engine");
const client_1 = require("./builders/client");
const supplier_1 = require("./builders/supplier");
const expenses_1 = require("./builders/expenses");
const product_1 = require("./builders/product");
const stockReport_1 = require("./stockReport");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
function requireAdminOrDev(context) {
    var _a, _b;
    const role = (_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.role;
    if (!context.auth || (role !== 'admin' && role !== 'developer')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin/Developer required.');
    }
}
async function getCompanyBaseCurrency(companyId) {
    var _a;
    const snap = await db.doc(`companies/${companyId}`).get();
    const base = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.baseCurrency;
    return (base || 'USD');
}
function bufferToBase64(buf) {
    return buf.toString('base64');
}
// --- helpers for deterministic error surfacing ---
function isHttpsError(err) {
    var _a;
    return err instanceof functions.https.HttpsError || ((_a = err === null || err === void 0 ? void 0 : err.constructor) === null || _a === void 0 ? void 0 : _a.name) === 'HttpsError';
}
function looksLikeMissingIndex(err) {
    const msg = String((err === null || err === void 0 ? void 0 : err.message) || '');
    // Covers: "The query requires an index. You can create it here: ..."
    return /requires an index|create.*index|create_composite/i.test(msg);
}
const ALLOWED_CODES = new Set(['cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists', 'permission-denied', 'unauthenticated', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range', 'unimplemented', 'internal', 'unavailable', 'data-loss']);
function normalizeHttpsCode(code) {
    const c = typeof code === 'string' ? code : '';
    return (ALLOWED_CODES.has(c) ? c : 'internal');
}
/**
 * Generic dispatcher for your UI convenience.
 */
exports.exportStatement = functions
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
        let buf;
        let filename;
        if (statementType === 'client') {
            if (!targetId)
                throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for client statement.');
            const { summary, rows } = await (0, client_1.buildClientStatement)({ companyId, clientId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency });
            filename = `client_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'supplier') {
            if (!targetId)
                throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
            const { summary, rows } = await (0, supplier_1.buildSupplierStatement)({ companyId, supplierId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency });
            filename = `supplier_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'expenses') {
            const { summary, rows } = await (0, expenses_1.buildExpensesStatement)({ companyId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency });
            filename = `expense_statement_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'productMovement') {
            if (!targetId)
                throw new functions.https.HttpsError('invalid-argument', 'Missing targetId for product statement.');
            const { summary, rows } = await (0, product_1.buildProductMovementStatement)({ companyId, productId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency: summary.baseCurrency });
            filename = `product_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'stockReport' || statementType === 'stock') {
            if (!stockMode)
                throw new functions.https.HttpsError('invalid-argument', 'Missing stockMode for stock report.');
            buf = await (0, stockReport_1.exportStockReportExcel)({ companyId, from: dateFrom, to: dateTo, baseCurrency, stockMode });
            filename = `stock_report_${stockMode}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf) };
        }
        throw new functions.https.HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);
    }
    catch (err) {
        console.error('exportStatement failed:', { code: err === null || err === void 0 ? void 0 : err.code, message: err === null || err === void 0 ? void 0 : err.message, stack: err === null || err === void 0 ? void 0 : err.stack });
        if (isHttpsError(err))
            throw err;
        if (looksLikeMissingIndex(err)) {
            throw new functions.https.HttpsError('failed-precondition', 'Firestore requires a composite index for this export (or the index is still building). Deploy firestore indexes, then retry.', { originalCode: err === null || err === void 0 ? void 0 : err.code, originalMessage: String((err === null || err === void 0 ? void 0 : err.message) || '') });
        }
        throw new functions.https.HttpsError(normalizeHttpsCode(err === null || err === void 0 ? void 0 : err.code), String((err === null || err === void 0 ? void 0 : err.message) || 'Export failed (internal). Check Cloud Functions logs.'), { originalCode: err === null || err === void 0 ? void 0 : err.code, originalMessage: String((err === null || err === void 0 ? void 0 : err.message) || '') });
    }
});
//# sourceMappingURL=productMovement.js.map