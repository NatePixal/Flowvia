"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportStatement = void 0;
// functions/src/index.ts
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const clientStatement_1 = require("./exports/clientStatement");
const supplierStatement_1 = require("./exports/supplierStatement");
const expenseStatement_1 = require("./exports/expenseStatement");
const productMovement_1 = require("./exports/productMovement");
const stockReport_1 = require("./exports/stockReport");
if (!admin.apps.length) {
    admin.initializeApp();
}
admin.firestore().settings({ ignoreUndefinedProperties: true });
function bufferToBase64(buf) {
    return buf.toString('base64');
}
exports.exportStatement = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 540, memory: '2GB' }) // Increased memory for safety
    .https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth || (context.auth.token.role !== 'admin' && context.auth.token.role !== 'developer')) {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin or developer to export data.');
    }
    const d = data;
    // Payload validation
    if (!(d === null || d === void 0 ? void 0 : d.companyId) || !(d === null || d === void 0 ? void 0 : d.statementType) || !(d === null || d === void 0 ? void 0 : d.dateFrom) || !(d === null || d === void 0 ? void 0 : d.dateTo)) {
        throw new functions.https.HttpsError("invalid-argument", "Missing required fields: companyId, statementType, dateFrom, dateTo.");
    }
    const companyId = String(d.companyId);
    const dateFrom = String(d.dateFrom);
    const dateTo = String(d.dateTo);
    const statementType = String(d.statementType);
    let buf;
    let filename = `statement_${statementType}_${dateFrom}_${dateTo}.xlsx`;
    try {
        if (statementType === "client") {
            if (!d.clientId || !d.baseCurrency)
                throw new functions.https.HttpsError("invalid-argument", "Missing clientId/baseCurrency for client statement.");
            buf = await (0, clientStatement_1.exportClientStatementExcel)({
                companyId,
                clientId: String(d.clientId),
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `client_${d.clientId}_${dateFrom}_${dateTo}.xlsx`;
        }
        else if (statementType === "supplier") {
            if (!d.supplierId || !d.supplierName || !d.baseCurrency) {
                throw new functions.https.HttpsError("invalid-argument", "Missing supplierId/supplierName/baseCurrency for supplier statement.");
            }
            buf = await (0, supplierStatement_1.exportSupplierStatementExcel)({
                companyId,
                supplierId: String(d.supplierId),
                supplierName: String(d.supplierName),
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `supplier_${d.supplierId}_${dateFrom}_${dateTo}.xlsx`;
        }
        else if (statementType === "expenses") {
            if (!d.baseCurrency)
                throw new functions.https.HttpsError("invalid-argument", "Missing baseCurrency for expense statement.");
            buf = await (0, expenseStatement_1.exportExpenseStatementExcel)({
                companyId,
                baseCurrency: String(d.baseCurrency),
                from: dateFrom,
                to: dateTo,
            });
            filename = `expenses_${dateFrom}_${dateTo}.xlsx`;
        }
        else if (statementType === "product") {
            if (!d.productCode)
                throw new functions.https.HttpsError("invalid-argument", "Missing productCode for product statement.");
            buf = await (0, productMovement_1.exportProductMovementExcel)({
                companyId,
                productCode: String(d.productCode),
                from: dateFrom,
                to: dateTo,
            });
            filename = `product_${d.productCode}_${dateFrom}_${dateTo}.xlsx`;
        }
        else if (statementType === "stock") {
            if (!d.baseCurrency || !d.stockMode)
                throw new functions.https.HttpsError("invalid-argument", "Missing baseCurrency/stockMode for stock report.");
            buf = await (0, stockReport_1.exportStockReportExcel)({
                companyId,
                baseCurrency: String(d.baseCurrency),
                stockMode: d.stockMode,
                from: dateFrom,
                to: dateTo,
            });
            filename = `stock_${d.stockMode}_${dateFrom}_${dateTo}.xlsx`;
        }
        else {
            throw new functions.https.HttpsError("invalid-argument", `Unknown statementType: ${statementType}`);
        }
    }
    catch (e) {
        console.error("Export generation failed:", e);
        throw e instanceof functions.https.HttpsError ? e : new functions.https.HttpsError("internal", (e === null || e === void 0 ? void 0 : e.message) || "Failed to generate the export file.");
    }
    return {
        filename,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64: bufferToBase64(buf),
    };
});
//# sourceMappingURL=index.js.map