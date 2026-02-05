"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExpensesStatement = buildExpensesStatement;
// functions/src/exports/builders/expenses.ts
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
async function buildExpensesStatement(params) {
    var _a, _b, _c, _d, _e, _f;
    const { companyId, from, to, baseCurrency } = params;
    // Adjust collection name if needed (dailyExpenses vs expenses)
    const ref = db.collection(`companies/${companyId}/dailyExpenses`);
    // BUSINESS date field required:
    const DATE_FIELD = 'businessDate';
    const fromTs = admin.firestore.Timestamp.fromDate(from);
    const toTs = admin.firestore.Timestamp.fromDate(to);
    const rangeSnap = await ref
        .where(DATE_FIELD, '>=', fromTs)
        .where(DATE_FIELD, '<=', toTs)
        .orderBy(DATE_FIELD, 'asc')
        .get();
    // For expenses: Opening is 0 unless you model cash accounts.
    const openingBase = 0;
    let runningBase = openingBase;
    const warnings = [];
    const totalsByCurrencyOrig = {};
    let missingFxCount = 0;
    const rows = [];
    for (const doc of rangeSnap.docs) {
        const e = doc.data();
        const date = (_b = (_a = toDate(e[DATE_FIELD])) !== null && _a !== void 0 ? _a : toDate(e.createdAt)) !== null && _b !== void 0 ? _b : from;
        const currency = e.currency || baseCurrency;
        // If you support refunds, set creditMinor accordingly.
        const debitMinor = Number((_d = (_c = e.amountMinor) !== null && _c !== void 0 ? _c : e.totalMinor) !== null && _d !== void 0 ? _d : 0);
        const creditMinor = Number((_e = e.refundMinor) !== null && _e !== void 0 ? _e : 0);
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
        }
        const description = e.vendor || e.payee || e.note || 'Expense';
        rows.push({
            businessDate: date,
            description,
            reference: doc.id,
            type: 'expense',
            currency,
            fxAsOf,
            fxRateToBase,
            fxStatus,
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
    const closingBase = rows.length ? ((_f = rows[rows.length - 1].runningBase) !== null && _f !== void 0 ? _f : openingBase) : openingBase;
    const summary = {
        title: 'Expense Statement',
        companyId,
        periodFrom: from,
        periodTo: to,
        entityLabel: 'Expenses (All)',
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
//# sourceMappingURL=expenses.js.map