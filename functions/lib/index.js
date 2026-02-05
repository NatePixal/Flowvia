"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStatement = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
// Initialize app
admin.initializeApp();
// Import builders
const statement_engine_1 = require("./exports/statement-engine");
const client_1 = require("./exports/builders/client");
const supplier_1 = require("./exports/builders/supplier");
const expenses_1 = require("./exports/builders/expenses");
const product_1 = require("./exports/builders/product");
const stockReport_1 = require("./exports/stockReport");
const db = admin.firestore();
function requireAdminOrDev(auth) {
    var _a;
    const role = (_a = auth === null || auth === void 0 ? void 0 : auth.token) === null || _a === void 0 ? void 0 : _a.role;
    if (!auth || (role !== 'admin' && role !== 'developer')) {
        throw new https_1.HttpsError('permission-denied', 'Admin/Developer required.');
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
// v2 onCall function
exports.exportStatement = (0, https_1.onCall)({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
    var _a;
    try {
        requireAdminOrDev(req.auth);
        const { companyId, statementType, targetId, dateFrom, dateTo, locale, stockMode } = req.data || {};
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
            // NOTE: This uses placeholder data as requested in the prompt.
            // Replace with real database queries.
            const stockRows = [
                {
                    "Product Name": "Sample Product",
                    "Current Stock Level": 10,
                    "Last Arrival Date": "2026-02-01",
                    "Arrival Quantity": 20,
                    "Unit Purchase Price": 2.5,
                    "Exchange Rate": 1,
                    "Total Value": 50,
                },
            ];
            const supplierRows = [
                {
                    "Date of Transfer": "2026-02-01",
                    "Supplier Name": "Supplier A",
                    "Product Purchased": "Sample Product",
                    "Quantity Bought": 20,
                    "Purchase Price (Original Currency)": 2.5,
                    "Daily Exchange Rate": 1,
                    "Total Paid (Local Currency)": 50,
                },
            ];
            const clientRows = [
                {
                    "Client Name": "Client X",
                    "Purchase Date": "2026-02-02",
                    "Product Name": "Sample Product",
                    "Quantity Purchased": 5,
                    "Unit Sale Price": 3,
                    "Exchange Rate (Day of Purchase)": 1,
                    "Total Amount Due": 15,
                    "Payment Status": "Loan",
                },
            ];
            const companySnap = await db.doc(`companies/${companyId}`).get();
            const companyName = ((_a = companySnap.data()) === null || _a === void 0 ? void 0 : _a.name) || 'FlowVia Business Solutions';
            const xlsxBuffer = await (0, stockReport_1.buildStockReportXlsx)({
                companyName: companyName,
                stockRows,
                supplierRows,
                clientRows,
            });
            return {
                base64: xlsxBuffer.toString("base64"),
                filename: `stock-report-${companyId}-${dateFrom}-${dateTo}.xlsx`,
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
//# sourceMappingURL=index.js.map