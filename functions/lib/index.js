"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureExpenseBusinessDate = exports.ensureLedgerBusinessDate = exports.exportStatement = void 0;
const functions = require("firebase-functions/v1");
const https_1 = require("firebase-functions/v1/https");
const admin_1 = require("./admin");
const statement_engine_1 = require("./exports/statement-engine");
const client_1 = require("./exports/builders/client");
const supplier_1 = require("./exports/builders/supplier");
const expenses_1 = require("./exports/builders/expenses");
const product_1 = require("./exports/builders/product");
const stockReport_1 = require("./exports/stockReport");
const firestore_1 = require("firebase-admin/firestore");
function requireAdminOrDev(auth) {
    var _a;
    const role = (_a = auth === null || auth === void 0 ? void 0 : auth.token) === null || _a === void 0 ? void 0 : _a.role;
    if (!auth || (role !== 'admin' && role !== 'developer')) {
        throw new https_1.HttpsError('permission-denied', 'Admin/Developer required.');
    }
}
async function getCompanyBaseCurrency(companyId) {
    var _a;
    const snap = await admin_1.db.doc(`companies/${companyId}`).get();
    const base = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.baseCurrency;
    return (base || 'USD');
}
function bufferToBase64(buf) {
    return buf.toString('base64');
}
// v1 onCall function
exports.exportStatement = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onCall(async (data, context) => {
    try {
        requireAdminOrDev(context.auth);
        const { companyId, statementType, targetId, dateFrom, dateTo, locale, stockMode } = data || {};
        if (!companyId || !statementType || !dateFrom || !dateTo) {
            throw new https_1.HttpsError('invalid-argument', 'Missing companyId/statementType/dateFrom/dateTo.');
        }
        const baseCurrency = await getCompanyBaseCurrency(companyId);
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        let buf;
        let filename;
        if (statementType === 'client') {
            if (!targetId)
                throw new https_1.HttpsError('invalid-argument', 'Missing targetId for client statement.');
            const { summary, rows } = await (0, client_1.buildClientStatement)({ companyId, clientId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency, locale });
            filename = `client_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'supplier') {
            if (!targetId)
                throw new https_1.HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
            const { summary, rows } = await (0, supplier_1.buildSupplierStatement)({ companyId, supplierId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency, locale });
            filename = `supplier_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'expenses') {
            const { summary, rows } = await (0, expenses_1.buildExpensesStatement)({ companyId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency, locale });
            filename = `expense_statement_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === 'productMovement') {
            if (!targetId)
                throw new https_1.HttpsError('invalid-argument', 'Missing targetId for product statement.');
            const { summary, rows } = await (0, product_1.buildProductMovementStatement)({ companyId, productId: targetId, from, to, baseCurrency });
            buf = await (0, statement_engine_1.buildStatementWorkbook)({ summary, rows, baseCurrency: summary.baseCurrency, locale });
            filename = `product_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }
        if (statementType === "stockReport") {
            if (!stockMode)
                throw new https_1.HttpsError('invalid-argument', 'Missing stockMode for stock report.');
            const xlsxBuffer = await (0, stockReport_1.exportStockReportExcel)({
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
        throw new https_1.HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);
    }
    catch (err) {
        console.error('exportStatement failed:', { code: err === null || err === void 0 ? void 0 : err.code, message: err === null || err === void 0 ? void 0 : err.message, stack: err === null || err === void 0 ? void 0 : err.stack });
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError('internal', String(err.message || 'Export failed (internal). Check Cloud Functions logs.'), { originalCode: err === null || err === void 0 ? void 0 : err.code, originalMessage: String((err === null || err === void 0 ? void 0 : err.message) || '') });
    }
});
// --- Business Date Triggers ---
function toBusinessDayFromCreatedAt(ts, tz = 'Asia/Tashkent') {
    const d = ts.toDate();
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${day}`; // YYYY-MM-DD
}
function businessDayToBusinessDate(businessDay) {
    return firestore_1.Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
}
exports.ensureLedgerBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/clients/{clientId}/ledger/{entryId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate)
        return null;
    const createdAt = data.createdAt;
    const businessDay = (typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        ? data.businessDay
        : (createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10));
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.ensureExpenseBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/dailyExpenses/{expenseId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate)
        return null;
    const createdAt = data.createdAt;
    const businessDay = (typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        ? data.businessDay
        : (createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10));
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
//# sourceMappingURL=index.js.map