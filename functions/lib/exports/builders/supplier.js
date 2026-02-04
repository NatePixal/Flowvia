"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSupplierStatement = buildSupplierStatement;
// functions/src/exports/builders/supplier.ts
const admin = require("firebase-admin");
const fx_1 = require("../fx");
const money_1 = require("../money");
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
async function buildSupplierStatement(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { companyId, supplierId, from, to, baseCurrency } = params;
    const supplierRef = db.doc(`companies/${companyId}/suppliers/${supplierId}`);
    const supplierSnap = await supplierRef.get();
    const supplierName = ((_a = supplierSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || supplierId;
    const ledgerRef = db.collection(`companies/${companyId}/suppliers/${supplierId}/ledger`);
    const DATE_FIELD = 'businessDate'; // preferred
    const fromTs = admin.firestore.Timestamp.fromDate(from);
    const toTs = admin.firestore.Timestamp.fromDate(to);
    const beforeSnap = await ledgerRef.where(DATE_FIELD, '<', fromTs).get();
    const rangeSnap = await ledgerRef
        .where(DATE_FIELD, '>=', fromTs)
        .where(DATE_FIELD, '<=', toTs)
        .orderBy(DATE_FIELD, 'asc')
        .get();
    let openingBase = 0;
    let runningBase = 0;
    const warnings = [];
    const totalsByCurrencyOrig = {};
    let missingFxCount = 0;
    // AP semantics:
    // purchase increases payable (CREDIT), payment decreases payable (DEBIT)
    async function entryDeltaBase(e, date, forOpening) {
        var _a, _b, _c;
        const currency = e.currency || baseCurrency;
        const isPurchase = e.type === 'purchase';
        const isPayment = e.type === 'payment';
        const creditMinor = isPurchase ? Number((_b = (_a = e.purchaseTotalMinor) !== null && _a !== void 0 ? _a : e.totalMinor) !== null && _b !== void 0 ? _b : 0) : 0;
        const debitMinor = isPayment ? Number((_c = e.paymentMinor) !== null && _c !== void 0 ? _c : 0) : 0;
        const creditOrig = (0, money_1.minorToMajor)(creditMinor, currency);
        const debitOrig = (0, money_1.minorToMajor)(debitMinor, currency);
        if (!forOpening) {
            totalsByCurrencyOrig[currency] || (totalsByCurrencyOrig[currency] = { debit: 0, credit: 0 });
            totalsByCurrencyOrig[currency].debit += debitOrig;
            totalsByCurrencyOrig[currency].credit += creditOrig;
        }
        const fx = await (0, fx_1.resolveFxToBase)({
            companyId,
            txCurrency: currency,
            baseCurrency,
            txDate: date,
            stored: { fxRateToBase: e.fxRateToBase, fxAsOf: e.fxAsOf },
        });
        if (!fx.ok) {
            missingFxCount++;
            return { ok: false, currency, debitOrig, creditOrig, fx };
        }
        const debitBase = debitOrig * fx.rateToBase;
        const creditBase = creditOrig * fx.rateToBase;
        const deltaBase = creditBase - debitBase; // payable increases with credit
        if (forOpening)
            openingBase += deltaBase;
        return { ok: true, currency, debitOrig, creditOrig, debitBase, creditBase, deltaBase, fx };
    }
    for (const d of beforeSnap.docs) {
        const e = d.data();
        const date = (_c = (_b = toDate(e[DATE_FIELD])) !== null && _b !== void 0 ? _b : toDate(e.createdAt)) !== null && _c !== void 0 ? _c : from;
        await entryDeltaBase(e, date, true);
    }
    runningBase = openingBase;
    const rows = [];
    for (const doc of rangeSnap.docs) {
        const e = doc.data();
        const date = (_e = (_d = toDate(e[DATE_FIELD])) !== null && _d !== void 0 ? _d : toDate(e.createdAt)) !== null && _e !== void 0 ? _e : from;
        const currency = e.currency || baseCurrency;
        const isPurchase = e.type === 'purchase';
        const isPayment = e.type === 'payment';
        const creditMinor = isPurchase ? Number((_g = (_f = e.purchaseTotalMinor) !== null && _f !== void 0 ? _f : e.totalMinor) !== null && _g !== void 0 ? _g : 0) : 0;
        const debitMinor = isPayment ? Number((_h = e.paymentMinor) !== null && _h !== void 0 ? _h : 0) : 0;
        const creditOrig = (0, money_1.minorToMajor)(creditMinor, currency);
        const debitOrig = (0, money_1.minorToMajor)(debitMinor, currency);
        totalsByCurrencyOrig[currency] || (totalsByCurrencyOrig[currency] = { debit: 0, credit: 0 });
        totalsByCurrencyOrig[currency].debit += debitOrig;
        totalsByCurrencyOrig[currency].credit += creditOrig;
        const fx = await (0, fx_1.resolveFxToBase)({
            companyId,
            txCurrency: currency,
            baseCurrency,
            txDate: date,
            stored: { fxRateToBase: e.fxRateToBase, fxAsOf: e.fxAsOf },
        });
        let debitBase = 0;
        let creditBase = 0;
        let fxAsOf = null;
        let fxRateToBase = null;
        let fxStatus = 'OK';
        if (fx.ok) {
            fxAsOf = fx.asOf;
            fxRateToBase = fx.rateToBase;
            debitBase = debitOrig * fx.rateToBase;
            creditBase = creditOrig * fx.rateToBase;
            runningBase = runningBase + creditBase - debitBase;
        }
        else {
            fxStatus = 'MISSING';
            missingFxCount++;
        }
        const description = e.note || (isPurchase ? 'Supplier Purchase' : isPayment ? 'Supplier Payment' : '');
        rows.push({
            businessDate: date,
            description,
            reference: doc.id,
            type: e.type || 'unknown',
            currency,
            fxAsOf,
            fxRateToBase,
            fxStatus,
            // For statement columns: Debit/ Credit must match what we chose above:
            debitOrig,
            creditOrig,
            debitBase,
            creditBase,
            runningBase,
        });
    }
    if (missingFxCount > 0) {
        warnings.push(`FX missing on ${missingFxCount} row(s). Base totals/running may be incomplete.`);
    }
    const totalDebitBase = rows.reduce((s, x) => s + (x.debitBase || 0), 0);
    const totalCreditBase = rows.reduce((s, x) => s + (x.creditBase || 0), 0);
    const closingBase = rows.length ? rows[rows.length - 1].runningBase : openingBase;
    const summary = {
        title: 'Supplier Statement',
        companyId,
        periodFrom: from,
        periodTo: to,
        entityLabel: `Supplier: ${supplierName}`,
        baseCurrency,
        openingBase,
        totalDebitBase,
        totalCreditBase,
        closingBase,
        txCount: rows.length,
        warnings,
        totalsByCurrencyOrig,
    };
    return { summary, rows };
}
//# sourceMappingURL=supplier.js.map