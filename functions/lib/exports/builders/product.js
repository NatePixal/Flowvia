"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProductMovementStatement = buildProductMovementStatement;
// functions/src/exports/builders/product.ts
const admin = require("firebase-admin");
const db = admin.firestore();
function toDate(v) {
    if (!v)
        return null;
    if (v instanceof Date)
        return v;
    if (typeof (v === null || v === void 0 ? void 0 : v.toDate) === 'function')
        return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
async function buildProductMovementStatement(params) {
    var _a, _b, _c;
    const { companyId, productId, from, to } = params;
    const productRef = db.doc(`companies/${companyId}/products/${productId}`);
    const productSnap = await productRef.get();
    const productName = ((_a = productSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || productId;
    const incomingRef = db.collection(`companies/${companyId}/incomingProducts`);
    const salesRef = db.collection(`companies/${companyId}/sales`);
    const fromTs = admin.firestore.Timestamp.fromDate(from);
    const toTs = admin.firestore.Timestamp.fromDate(to);
    // Get all relevant movements
    const incomingQuery = incomingRef.where('productCode', '==', productId);
    const salesQuery = salesRef.where('productId', '==', productId);
    const [incomingSnap, salesSnap] = await Promise.all([
        incomingQuery.get(),
        salesQuery.get(),
    ]);
    const allMovements = [
        ...incomingSnap.docs.map(d => { var _a; return ({ type: 'IN', doc: d.data(), id: d.id, date: toDate((_a = d.data().incomeDate) !== null && _a !== void 0 ? _a : d.data().date) }); }),
        ...salesSnap.docs.map(d => ({ type: 'OUT', doc: d.data(), id: d.id, date: toDate(d.data().date) })),
    ].filter(m => m.date && m.date >= from && m.date <= to)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    // Opening Qty calculation
    const beforeIncomingSnap = await incomingQuery.where('incomeDate', '<', fromTs).get();
    const beforeSalesSnap = await salesQuery.where('date', '<', fromTs).get();
    let openingQty = 0;
    beforeIncomingSnap.forEach(d => { var _a; openingQty += Number((_a = d.data().quantity) !== null && _a !== void 0 ? _a : 0); });
    beforeSalesSnap.forEach(d => { var _a; openingQty -= Number((_a = d.data().quantity) !== null && _a !== void 0 ? _a : 0); });
    let runningQty = openingQty;
    const rows = [];
    for (const movement of allMovements) {
        let qtyIn = 0;
        let qtyOut = 0;
        let description = '';
        if (movement.type === 'IN') {
            qtyIn = Number((_b = movement.doc.quantity) !== null && _b !== void 0 ? _b : 0);
            description = `Incoming from ${movement.doc.supplier || 'N/A'}`;
        }
        else { // OUT
            qtyOut = Number((_c = movement.doc.quantity) !== null && _c !== void 0 ? _c : 0);
            description = `Sale to ${movement.doc.clientName || 'N/A'}`;
        }
        runningQty = runningQty + qtyIn - qtyOut;
        // This is a quantity statement, not financial. Debit/Credit represent quantity.
        rows.push({
            businessDate: movement.date,
            description: description,
            reference: movement.id,
            type: movement.type === 'IN' ? 'Incoming' : 'Sale',
            currency: 'QTY',
            debitOrig: qtyIn,
            creditOrig: qtyOut,
            debitBase: qtyIn,
            creditBase: qtyOut,
            runningBase: runningQty,
        });
    }
    const summary = {
        title: 'Product Movement Statement',
        companyId,
        periodFrom: from,
        periodTo: to,
        entityLabel: `Product: ${productName} (${productId})`,
        baseCurrency: 'QTY',
        openingBase: openingQty,
        totalDebitBase: rows.reduce((s, r) => s + r.debitBase, 0),
        totalCreditBase: rows.reduce((s, r) => s + r.creditBase, 0),
        closingBase: runningQty,
        txCount: rows.length,
        warnings: [],
        totalsByCurrencyOrig: { 'QTY': { debit: rows.reduce((s, r) => s + r.debitOrig, 0), credit: rows.reduce((s, r) => s + r.creditOrig, 0) } },
    };
    return { summary, rows };
}
//# sourceMappingURL=product.js.map