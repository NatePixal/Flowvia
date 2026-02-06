"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveFxToBase = resolveFxToBase;
// functions/src/exports/fx.ts
const firestore_1 = require("firebase-admin/firestore");
const admin_1 = require("../admin");
function toDateSafe(v) {
    if (!v)
        return null;
    if (v instanceof Date)
        return v;
    if (typeof (v === null || v === void 0 ? void 0 : v.toDate) === 'function')
        return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
/**
 * Resolve FX for a single transaction row.
 * - If currency == baseCurrency => rate 1
 * - Prefer stored fxRateToBase + fxAsOf on the record if present
 * - Else fallback to nearest snapshot where asOf <= txDate
 */
async function resolveFxToBase(params) {
    var _a;
    const { companyId, txCurrency, baseCurrency, txDate, stored } = params;
    if (txCurrency === baseCurrency) {
        return { ok: true, rateToBase: 1, asOf: txDate, source: 'identity' };
    }
    const storedRate = typeof (stored === null || stored === void 0 ? void 0 : stored.fxRateToBase) === 'number' ? stored.fxRateToBase : null;
    const storedAsOf = toDateSafe(stored === null || stored === void 0 ? void 0 : stored.fxAsOf);
    if (storedRate && storedRate > 0 && storedAsOf) {
        return { ok: true, rateToBase: storedRate, asOf: storedAsOf, source: 'stored' };
    }
    // Fallback snapshot lookup:
    // companies/{companyId}/fxSnapshots : { asOf, baseCurrency, ratesToBase{USD:1, UZS:..., AED:...} }
    const snap = await admin_1.db
        .collection(`companies/${companyId}/fxSnapshots`)
        .where('baseCurrency', '==', baseCurrency)
        .where('asOf', '<=', firestore_1.Timestamp.fromDate(txDate))
        .orderBy('asOf', 'desc')
        .limit(1)
        .get();
    if (snap.empty) {
        return { ok: false, reason: 'missing_fx_snapshot' };
    }
    const doc = snap.docs[0].data();
    const rate = (_a = doc === null || doc === void 0 ? void 0 : doc.ratesToBase) === null || _a === void 0 ? void 0 : _a[txCurrency];
    if (!rate || rate <= 0) {
        return { ok: false, reason: 'missing_rate_for_currency' };
    }
    const asOf = doc.asOf.toDate();
    return { ok: true, rateToBase: rate, asOf, source: 'snapshot' };
}
//# sourceMappingURL=fx.js.map