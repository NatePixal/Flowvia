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
    const { companyId, productId, from, to } = params;
    // 1) Load product to get productCode
    const productRef = db.doc(`companies/${companyId}/products/${productId}`);
    const productSnap = await productRef.get();
    const productData = productSnap.data() || {};
    const productCode = productData.productCode || productId; // fallback
    const productName = productData.name || productCode;
    // 2) Read movements for THIS product
    const incomingRef = db.collection(`companies/${companyId}/incomingProducts`);
    const salesRef = db.collection(`companies/${companyId}/sales`);
    const [incomingSnap, salesSnap] = await Promise.all([
        incomingRef.where('productCode', '==', productCode).get(),
        salesRef.where('productId', '==', productId).get(),
    ]);
    // 3) Normalize movements + dates
    const incomingMovements = incomingSnap.docs.map((d) => {
        var _a, _b, _c;
        const doc = d.data();
        const date = toDate((_b = (_a = doc.businessDate) !== null && _a !== void 0 ? _a : doc.incomeDate) !== null && _b !== void 0 ? _b : doc.date);
        const qty = Number((_c = doc.quantity) !== null && _c !== void 0 ? _c : 0);
        return {
            kind: 'IN',
            id: d.id,
            doc,
            date,
            qty,
        };
    });
    const salesMovements = salesSnap.docs.map((d) => {
        var _a, _b, _c;
        const doc = d.data();
        const date = toDate((_b = (_a = doc.businessDate) !== null && _a !== void 0 ? _a : doc.date) !== null && _b !== void 0 ? _b : doc.createdAt);
        const qty = Number((_c = doc.quantity) !== null && _c !== void 0 ? _c : 0);
        return {
            kind: 'OUT',
            id: d.id,
            doc,
            date,
            qty,
        };
    });
    // 4) Compute openingQty LOCALLY (no extra Firestore queries => no index crash)
    let openingQty = 0;
    for (const m of incomingMovements) {
        if (m.date && m.date < from)
            openingQty += m.qty;
    }
    for (const m of salesMovements) {
        if (m.date && m.date < from)
            openingQty -= m.qty;
    }
    // 5) Build rows in range
    const inRange = [...incomingMovements, ...salesMovements]
        .filter((m) => m.date && m.date >= from && m.date <= to)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    let runningQty = openingQty;
    const rows = [];
    for (const m of inRange) {
        const qtyIn = m.kind === 'IN' ? m.qty : 0;
        const qtyOut = m.kind === 'OUT' ? m.qty : 0;
        const description = m.kind === 'IN'
            ? `Incoming from ${m.doc.supplier || 'N/A'}`
            : `Sale to ${m.doc.clientName || 'N/A'}`;
        runningQty = runningQty + qtyIn - qtyOut;
        rows.push({
            businessDate: m.date,
            description,
            reference: m.id,
            type: m.kind === 'IN' ? 'Incoming' : 'Sale',
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
        entityLabel: `Product: ${productName} (${productCode})`,
        baseCurrency: 'QTY',
        openingBase: openingQty,
        totalDebitBase: rows.reduce((s, r) => s + (r.debitBase || 0), 0),
        totalCreditBase: rows.reduce((s, r) => s + (r.creditBase || 0), 0),
        closingBase: runningQty,
        txCount: rows.length,
        warnings: [],
        totalsByCurrencyOrig: {
            QTY: {
                debit: rows.reduce((s, r) => s + (r.debitOrig || 0), 0),
                credit: rows.reduce((s, r) => s + (r.creditOrig || 0), 0),
            },
        },
    };
    return { summary, rows };
}
//# sourceMappingURL=product.js.map