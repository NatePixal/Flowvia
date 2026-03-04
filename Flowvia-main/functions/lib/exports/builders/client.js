"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildClientStatement = buildClientStatement;
// functions/src/exports/builders/client.ts
const firestore_1 = require("firebase-admin/firestore");
const admin_1 = require("../../admin");
const fx_1 = require("../fx");
const money_1 = require("../money");
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
async function buildClientStatement(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { companyId, clientId, from, to, baseCurrency } = params;
    const clientRef = admin_1.db.doc(`companies/${companyId}/clients/${clientId}`);
    const clientSnap = await clientRef.get();
    const clientName = ((_a = clientSnap.data()) === null || _a === void 0 ? void 0 : _a.name) || clientId;
    const ledgerRef = admin_1.db.collection(`companies/${companyId}/clients/${clientId}/ledger`);
    // IMPORTANT: ideally ledger should have businessDate.
    // If not, you must adapt the query field to your model.
    const DATE_FIELD = 'businessDate'; // preferred
    // Fallback: if your ledger doesn't have businessDate, use 'createdAt' and accept limitations.
    const fromTs = firestore_1.Timestamp.fromDate(from);
    const toTs = firestore_1.Timestamp.fromDate(to);
    // Opening: all entries before "from"
    const beforeSnap = await ledgerRef.where(DATE_FIELD, '<', fromTs).get();
    // In-range: entries between from..to ordered
    const rangeSnap = await ledgerRef
        .where(DATE_FIELD, '>=', fromTs)
        .where(DATE_FIELD, '<=', toTs)
        .orderBy(DATE_FIELD, 'asc')
        .get();
    let openingBase = 0;
    const warnings = [];
    const totalsByCurrencyOrig = {};
    let missingFxCount = 0;
    // Helper: apply one ledger entry into base totals
    async function applyEntryToBase(e, date, isForOpening) {
        var _a, _b, _c;
        const currency = e.currency || baseCurrency;
        const isPurchase = e.type === 'purchase';
        const isPayment = e.type === 'payment';
        const debitMinor = isPurchase ? Number((_a = e.totalMinor) !== null && _a !== void 0 ? _a : 0) : 0;
        const creditMinor = isPayment ? Number((_c = (_b = e.paymentMinor) !== null && _b !== void 0 ? _b : e.totalMinor) !== null && _c !== void 0 ? _c : 0) : 0;
        const debitOrig = (0, money_1.minorToMajor)(debitMinor, currency);
        const creditOrig = (0, money_1.minorToMajor)(creditMinor, currency);
        // Totals-by-currency only for in-range rows (not opening)
        if (!isForOpening) {
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
            return { ok: false, debitOrig, creditOrig, currency, fx };
        }
        const debitBase = debitOrig * fx.rateToBase;
        const creditBase = creditOrig * fx.rateToBase;
        // For AR: running/outstanding increases with purchases (debit), decreases with payments (credit)
        const deltaBase = debitBase - creditBase;
        if (isForOpening)
            openingBase += deltaBase;
        return {
            ok: true,
            currency,
            debitOrig,
            creditOrig,
            fxAsOf: fx.asOf,
            fxRateToBase: fx.rateToBase,
            debitBase,
            creditBase,
            deltaBase,
        };
    }
    // Compute opening
    for (const d of beforeSnap.docs) {
        const e = d.data();
        const date = (_c = (_b = toDate(e[DATE_FIELD])) !== null && _b !== void 0 ? _b : toDate(e.createdAt)) !== null && _c !== void 0 ? _c : from; // fallback
        await applyEntryToBase(e, date, true);
    }
    // Build statement rows with runningBase
    let runningBase = openingBase;
    const rows = [];
    for (const doc of rangeSnap.docs) {
        const e = doc.data();
        const date = (_e = (_d = toDate(e[DATE_FIELD])) !== null && _d !== void 0 ? _d : toDate(e.createdAt)) !== null && _e !== void 0 ? _e : from;
        const ref = doc.id;
        const isPurchase = e.type === 'purchase';
        const isPayment = e.type === 'payment';
        const currency = e.currency || baseCurrency;
        const debitMinor = isPurchase ? Number((_f = e.totalMinor) !== null && _f !== void 0 ? _f : 0) : 0;
        const creditMinor = isPayment ? Number((_h = (_g = e.paymentMinor) !== null && _g !== void 0 ? _g : e.totalMinor) !== null && _h !== void 0 ? _h : 0) : 0;
        const debitOrig = (0, money_1.minorToMajor)(debitMinor, currency);
        const creditOrig = (0, money_1.minorToMajor)(creditMinor, currency);
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
            runningBase = runningBase + debitBase - creditBase;
        }
        else {
            fxStatus = 'MISSING';
            missingFxCount++;
            // runningBase unchanged
        }
        const description = isPurchase && Array.isArray(e.items) && e.items.length
            ? e.items.map((it) => `${it.qty}× ${it.name}`).join(', ')
            : (e.note || '');
        rows.push({
            businessDate: date,
            description,
            reference: ref,
            type: e.type || 'unknown',
            currency,
            fxAsOf,
            fxRateToBase,
            fxStatus,
            debitOrig,
            creditOrig,
            debitBase,
            creditBase,
            runningBase,
            meta: { items: Array.isArray(e.items) ? e.items : null }
        });
    }
    if (missingFxCount > 0) {
        warnings.push(`FX missing on ${missingFxCount} row(s). Base totals/running may be incomplete.`);
    }
    const totalDebitBase = rows.reduce((s, x) => s + (x.debitBase || 0), 0);
    const totalCreditBase = rows.reduce((s, x) => s + (x.creditBase || 0), 0);
    const closingBase = rows.length ? ((_j = rows[rows.length - 1].runningBase) !== null && _j !== void 0 ? _j : openingBase) : openingBase;
    const summary = {
        title: 'Client Statement',
        companyId,
        periodFrom: from,
        periodTo: to,
        entityLabel: `Client: ${clientName}`,
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
//# sourceMappingURL=client.js.map