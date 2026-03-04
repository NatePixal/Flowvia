"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExpensesStatement = buildExpensesStatement;
// functions/src/exports/builders/expenses.ts
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
async function buildExpensesStatement(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const { companyId, from, to, baseCurrency } = params;
    // Adjust collection name if needed (dailyExpenses vs expenses)
    const ref = admin_1.db.collection(`companies/${companyId}/dailyExpenses`);
    // BUSINESS date field required:
    const DATE_FIELD = 'businessDate';
    const fromTs = firestore_1.Timestamp.fromDate(from);
    const toTs = firestore_1.Timestamp.fromDate(to);
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
        const date = (_c = (_b = (_a = toDate(e.businessDate)) !== null && _a !== void 0 ? _a : toDate(e.date)) !== null && _b !== void 0 ? _b : toDate(e.createdAt)) !== null && _c !== void 0 ? _c : from;
        const currency = e.currency || baseCurrency;
        // amountMinor is what your UI stores (UZS etc)
        const debitMinor = Number((_e = (_d = e.amountMinor) !== null && _d !== void 0 ? _d : e.totalMinor) !== null && _e !== void 0 ? _e : 0);
        const creditMinor = Number((_f = e.refundMinor) !== null && _f !== void 0 ? _f : 0);
        const debitOrig = (0, money_1.minorToMajor)(debitMinor, currency);
        const creditOrig = (0, money_1.minorToMajor)(creditMinor, currency);
        totalsByCurrencyOrig[currency] || (totalsByCurrencyOrig[currency] = { debit: 0, credit: 0 });
        totalsByCurrencyOrig[currency].debit += debitOrig;
        totalsByCurrencyOrig[currency].credit += creditOrig;
        // ✅ READ LOCKED FX FROM e.fx.* (your real data)
        const storedRate = typeof ((_g = e.fx) === null || _g === void 0 ? void 0 : _g.rateToBase) === 'number' ? e.fx.rateToBase : e.fxRateToBase;
        const storedAsOf = (_j = toDate((_h = e.fx) === null || _h === void 0 ? void 0 : _h.capturedAt)) !== null && _j !== void 0 ? _j : toDate(e.fxAsOf);
        // If you already store base minor, use it even if snapshots are missing:
        const baseMinor = typeof e.amountBaseMinor === 'number' ? e.amountBaseMinor : null;
        const fx = await (0, fx_1.resolveFxToBase)({
            companyId,
            txCurrency: currency,
            baseCurrency,
            txDate: date,
            stored: { fxRateToBase: storedRate, fxAsOf: storedAsOf },
        });
        let debitBase = 0;
        let creditBase = 0;
        let fxAsOf = null;
        let fxRateToBase = null;
        let fxStatus = 'OK';
        if (currency === baseCurrency) {
            fxAsOf = date;
            fxRateToBase = 1;
            debitBase = debitOrig;
            creditBase = creditOrig;
            runningBase = runningBase + debitBase - creditBase;
        }
        else if (baseMinor !== null) {
            // ✅ strongest source: saved base amount
            debitBase = (0, money_1.minorToMajor)(baseMinor, baseCurrency);
            fxRateToBase = debitOrig > 0 ? (debitBase / debitOrig) : (fx.ok ? fx.rateToBase : null);
            fxAsOf = storedAsOf !== null && storedAsOf !== void 0 ? storedAsOf : (fx.ok ? fx.asOf : null);
            fxStatus = 'STORED_BASE';
            runningBase = runningBase + debitBase - creditBase;
        }
        else if (fx.ok) {
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
        // ✅ Use YOUR UI fields
        const category = e.expenseType || '';
        const desc = (e.description || e.note || '').trim() || 'Expense';
        const paidTo = e.paid_to_seller_name || e.vendor || e.payee || '';
        const employee = e.employee_name || '';
        const createdBy = e.createdBy || '';
        rows.push({
            businessDate: date,
            description: desc,
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
            meta: {
                category,
                paidTo,
                employee,
                createdBy,
                fxPair: ((_k = e.fx) === null || _k === void 0 ? void 0 : _k.enteredPair) || '',
                fxEnteredRate: (_m = (_l = e.fx) === null || _l === void 0 ? void 0 : _l.enteredRate) !== null && _m !== void 0 ? _m : null,
                amountOrig: debitOrig,
                amountBase: debitBase,
            },
        });
    }
    if (missingFxCount > 0) {
        warnings.push(`FX missing on ${missingFxCount} row(s). Base totals/running may be incomplete.`);
    }
    const totalDebitBase = rows.reduce((s, x) => s + (x.debitBase || 0), 0);
    const totalCreditBase = rows.reduce((s, x) => s + (x.creditBase || 0), 0);
    const closingBase = rows.length ? ((_o = rows[rows.length - 1].runningBase) !== null && _o !== void 0 ? _o : openingBase) : openingBase;
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