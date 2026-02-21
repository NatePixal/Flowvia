"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAgriConsumptionWriteRecomputeSeasonTotal = exports.exportSeasonPnl = exports.confirmSettlement = exports.recordAgriConsumption = exports.createHarvestBatch = exports.createSalesAdjustment = exports.generateVatReturn = exports.generateInvoicePdf = exports.issueInvoiceForSale = exports.recomputeIncomingVatAndTotals = exports.recomputeSaleTaxAndTotals = exports.ensureBusinessFieldsOnSettlementCreate = exports.ensureBusinessFieldsOnAgriBatchCreate = exports.ensureBusinessFieldsOnAgriConsumptionCreate = exports.ensureBusinessFieldsOnSaleCreate = exports.ensureBusinessFieldsOnIncomingCreate = exports.ensureBusinessFieldsOnExpenseCreate = exports.ensureTaxSettingsExists = exports.exportStatement = void 0;
// functions/src/index.ts
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const money_1 = require("./money");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
/**
 * This is the main entry point for all Cloud Functions.
 *
 * It should only import and re-export functions from other files.
 * This makes it clear what is being deployed and avoids complex logic in the root file.
 */
// Export functions for creating statements and reports
var exports_1 = require("./exports");
Object.defineProperty(exports, "exportStatement", { enumerable: true, get: function () { return exports_1.exportStatement; } });
// Export functions for data maintenance and one-off scripts
__exportStar(require("./maintenance"), exports);
// Export functions for core financial recalculations and compatibility stubs
__exportStar(require("./financials"), exports);
const FvFieldValue = admin.firestore.FieldValue;
function fvRequireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
    }
    return context.auth;
}
function fvRequireRole(context, ...roles) {
    var _a;
    const auth = fvRequireAuth(context);
    const role = (_a = auth.token.role) !== null && _a !== void 0 ? _a : 'sales';
    if (!roles.includes(role)) {
        throw new functions.https.HttpsError('permission-denied', `Requires one of roles: ${roles.join(', ')}`);
    }
    return auth;
}
function fvGetCompanyId(context, data) {
    var _a;
    const auth = fvRequireAuth(context);
    const role = (_a = auth.token.role) !== null && _a !== void 0 ? _a : 'sales';
    const claimCompanyId = auth.token.companyId;
    const requested = data === null || data === void 0 ? void 0 : data.companyId;
    if (role === 'developer') {
        const cid = requested || claimCompanyId;
        if (!cid) {
            throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
        }
        return cid;
    }
    if (!claimCompanyId) {
        throw new functions.https.HttpsError('failed-precondition', 'No companyId in token.');
    }
    if (requested && requested !== claimCompanyId) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot access another company.');
    }
    return claimCompanyId;
}
function fvToBusinessDate(value) {
    let d;
    if (!value)
        d = new Date();
    else if (value instanceof admin.firestore.Timestamp)
        d = value.toDate();
    else if (value instanceof Date)
        d = value;
    else
        d = new Date(value);
    if (isNaN(d.getTime()))
        d = new Date();
    return d.toISOString().slice(0, 10);
}
function fvToBusinessDay(dateStr) {
    return parseInt(dateStr.replace(/-/g, ''), 10);
}
function fvRoundMinor(value, mode = 'HALF_UP') {
    if (!Number.isFinite(value))
        return 0;
    switch (mode) {
        case 'DOWN':
            return Math.floor(value);
        case 'BANKERS': {
            const floor = Math.floor(value);
            const frac = value - floor;
            if (Math.abs(frac - 0.5) < 1e-9)
                return floor % 2 === 0 ? floor : floor + 1;
            return Math.round(value);
        }
        case 'HALF_UP':
        default:
            return Math.round(value);
    }
}
async function fvWriteAuditLog(companyId, entityType, entityId, action, uid, before, after) {
    try {
        await firestore.collection(`companies/${companyId}/auditLogs`).add({
            entityType,
            entityId,
            action,
            before: before !== null && before !== void 0 ? before : null,
            after: after !== null && after !== void 0 ? after : null,
            uid,
            timestamp: FvFieldValue.serverTimestamp(),
        });
    }
    catch (e) {
        console.error('[fvWriteAuditLog] non-fatal error', e);
    }
}
function fvDefaultTaxSettings(country, overrides) {
    var _a, _b;
    const currencyByCountry = {
        AE: 'AED',
        SA: 'SAR',
        JO: 'JOD',
        EG: 'EGP',
    };
    // Editable defaults — you can update these per company from the UI later.
    const rateByCountry = {
        AE: 0.05,
        SA: 0.15,
        JO: 0.16, // verify category-specific rules in your accountant setup
        EG: 0.14,
    };
    const vatRates = [
        { code: 'STD', rate: (_a = rateByCountry[country]) !== null && _a !== void 0 ? _a : 0, label: 'Standard' },
        { code: 'ZERO', rate: 0, label: 'Zero-rated' },
        { code: 'EXEMPT', rate: null, label: 'Exempt' },
    ];
    return Object.assign({ country, currency: (_b = currencyByCountry[country]) !== null && _b !== void 0 ? _b : 'USD', vatEnabled: true, vatRates, defaultVatCode: 'STD', roundingMode: 'HALF_UP', invoiceProfile: {
            enabled: true,
            prefix: 'INV',
            nextNumber: 1,
            padding: 6,
        }, seller: {}, eInvoicing: country === 'SA'
            ? { system: 'ZATCA', phase: 'READY_ONLY' }
            : { system: null, phase: 'READY_ONLY' } }, overrides);
}
async function fvLoadTaxSettings(companyId) {
    const ref = firestore.doc(`companies/${companyId}/settings/tax`);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'Tax settings not found. Run ensureTaxSettingsExists first.');
    }
    return snap.data();
}
function fvResolveVatRate(settings, vatCode) {
    var _a;
    if (!settings.vatEnabled)
        return 0;
    const code = vatCode || settings.defaultVatCode || 'STD';
    const row = settings.vatRates.find(r => r.code === code);
    return (_a = row === null || row === void 0 ? void 0 : row.rate) !== null && _a !== void 0 ? _a : 0;
}
async function fvInferProductVatCode(companyId, productId, fallbackCode) {
    if (fallbackCode)
        return fallbackCode;
    if (!productId)
        return undefined;
    const snap = await firestore.doc(`companies/${companyId}/products/${productId}`).get();
    if (!snap.exists)
        return undefined;
    const product = snap.data();
    return product.vatCode;
}
function fvComputeVatAmountsFromNet(netMinor, vatRate, rounding) {
    const vatMinor = fvRoundMinor(netMinor * vatRate, rounding);
    return {
        netMinor,
        vatMinor,
        grossMinor: netMinor + vatMinor,
    };
}
function fvPadInvoiceNumber(prefix, nextNumber, padding) {
    return `${prefix}-${String(nextNumber).padStart(padding, '0')}`;
}
function fvMonthRange(period) {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) {
        throw new functions.https.HttpsError('invalid-argument', 'period must be YYYY-MM');
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid month');
    }
    const startDate = `${m[1]}-${m[2]}-01`;
    const end = new Date(Date.UTC(year, month, 0)); // last day of requested month
    const endDate = end.toISOString().slice(0, 10);
    return {
        startDate,
        endDate,
        startDay: fvToBusinessDay(startDate),
        endDay: fvToBusinessDay(endDate),
    };
}
async function fvStampBusinessFieldsIfMissing(ref, data, dateCandidates) {
    const hasBusinessFields = typeof (data === null || data === void 0 ? void 0 : data.businessDate) === 'string' && typeof (data === null || data === void 0 ? void 0 : data.businessDay) === 'number';
    if (hasBusinessFields)
        return;
    let rawDate = null;
    for (const k of dateCandidates) {
        if (data === null || data === void 0 ? void 0 : data[k]) {
            rawDate = data[k];
            break;
        }
    }
    const businessDate = fvToBusinessDate(rawDate);
    const businessDay = fvToBusinessDay(businessDate);
    await ref.set({
        businessDate,
        businessDay,
        updatedAt: FvFieldValue.serverTimestamp(),
    }, { merge: true });
}
async function fvRecomputeSaleVatAndTotals(companyId, saleRef, saleData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const settings = await fvLoadTaxSettings(companyId);
    const qty = Number((_a = saleData.quantity) !== null && _a !== void 0 ? _a : 0);
    const saleCurrency = (saleData.salePriceCurrency || settings.currency);
    const unitPriceMajor = Number((_b = saleData.salePrice) !== null && _b !== void 0 ? _b : 0);
    const unitPriceMinor = (0, money_1.toMinor)(unitPriceMajor, saleCurrency);
    const discountMajor = Number((_c = saleData.discount) !== null && _c !== void 0 ? _c : 0);
    const discountMinor = (0, money_1.toMinor)(discountMajor, saleCurrency);
    const vatCode = (await fvInferProductVatCode(companyId, saleData.productId, saleData.vatCode)) || settings.defaultVatCode;
    const vatRate = fvResolveVatRate(settings, vatCode);
    const netMinorRaw = Math.max(0, qty * unitPriceMinor - discountMinor);
    const computed = fvComputeVatAmountsFromNet(netMinorRaw, vatRate, settings.roundingMode);
    const paidTotal = Number((_f = (_e = (_d = saleData.totals) === null || _d === void 0 ? void 0 : _d.paidTotal) !== null && _e !== void 0 ? _e : saleData.paidMinor) !== null && _f !== void 0 ? _f : 0);
    const dueTotal = Math.max(0, computed.grossMinor - paidTotal);
    // Optional base currency conversion for consolidated reporting
    const baseCurrency = (saleData.baseCurrency || ((_g = (await firestore.doc(`companies/${companyId}`).get()).data()) === null || _g === void 0 ? void 0 : _g.baseCurrency) || saleCurrency);
    let revenueBaseMinor = saleData.revenueBaseMinor;
    if (saleCurrency === baseCurrency) {
        revenueBaseMinor = computed.grossMinor;
    }
    else if ((_h = saleData.fx) === null || _h === void 0 ? void 0 : _h.rateToBase) {
        revenueBaseMinor = (0, money_1.convertMinorToBase)(computed.grossMinor, saleData.fx.rateToBase, saleCurrency, baseCurrency);
    }
    const patch = {
        vatCode,
        vat: {
            code: vatCode,
            rate: vatRate,
            netMinor: computed.netMinor,
            vatMinor: computed.vatMinor,
            grossMinor: computed.grossMinor,
            currency: saleCurrency,
        },
        taxSummary: [
            {
                code: vatCode,
                rate: vatRate,
                netMinor: computed.netMinor,
                vatMinor: computed.vatMinor,
            },
        ],
        totals: {
            netTotal: computed.netMinor,
            vatTotal: computed.vatMinor,
            grossTotal: computed.grossMinor,
            paidTotal,
            dueTotal,
        },
        // Keep old fields in sync for existing screens/reports
        revenueMinor: computed.grossMinor,
        revenueBaseMinor: (_j = revenueBaseMinor !== null && revenueBaseMinor !== void 0 ? revenueBaseMinor : saleData.revenueBaseMinor) !== null && _j !== void 0 ? _j : null,
        updatedAt: FvFieldValue.serverTimestamp(),
    };
    // Stamp business fields too (sales use different date aliases in your app)
    const businessDate = fvToBusinessDate(saleData.date || saleData.recordedAt || saleData.createdAt || null);
    const businessDay = fvToBusinessDay(businessDate);
    await saleRef.set(Object.assign(Object.assign({}, patch), { businessDate, businessDay }), { merge: true });
    return patch;
}
async function fvRecomputeIncomingVat(companyId, ref, data) {
    var _a, _b;
    const settings = await fvLoadTaxSettings(companyId);
    const currency = (data.currency || settings.currency);
    const totalCostMinor = Number((_a = data.totalCostMinor) !== null && _a !== void 0 ? _a : 0) ||
        (0, money_1.toMinor)(Number((_b = data.totalCost) !== null && _b !== void 0 ? _b : 0), currency);
    let vatCode = data.vatCode;
    if (!vatCode && data.productId) {
        vatCode = await fvInferProductVatCode(companyId, data.productId);
    }
    if (!vatCode && data.productCode) {
        // Optional fallback by productCode
        const q = await firestore
            .collection(`companies/${companyId}/products`)
            .where('productCode', '==', data.productCode)
            .limit(1)
            .get();
        if (!q.empty)
            vatCode = q.docs[0].data().vatCode;
    }
    vatCode = vatCode || settings.defaultVatCode;
    const vatRate = fvResolveVatRate(settings, vatCode);
    const amounts = fvComputeVatAmountsFromNet(totalCostMinor, vatRate, settings.roundingMode);
    const businessDate = fvToBusinessDate(data.date || data.incomeDate || data.recordedAt || data.createdAt || null);
    const businessDay = fvToBusinessDay(businessDate);
    await ref.set({
        vatCode,
        vat: {
            code: vatCode,
            rate: vatRate,
            netTotalMinor: amounts.netMinor,
            vatTotalMinor: amounts.vatMinor,
            grossTotalMinor: amounts.grossMinor,
            currency,
        },
        totalCostMinor: totalCostMinor,
        businessDate,
        businessDay,
        updatedAt: FvFieldValue.serverTimestamp(),
    }, { merge: true });
    return Object.assign(Object.assign({ vatCode,
        vatRate }, amounts), { currency });
}
// ─────────────────────────────────────────────────────────────────────────────
// 1) Country Pack setup
// ─────────────────────────────────────────────────────────────────────────────
exports.ensureTaxSettingsExists = functions.https.onCall(async (data, context) => {
    var _a, _b;
    const auth = fvRequireRole(context, 'admin', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const country = ((data === null || data === void 0 ? void 0 : data.country) || 'AE');
    const ref = firestore.doc(`companies/${companyId}/settings/tax`);
    const snap = await ref.get();
    if (snap.exists && !(data === null || data === void 0 ? void 0 : data.force)) {
        return { success: true, created: false, settings: snap.data() };
    }
    const defaults = fvDefaultTaxSettings(country, (data === null || data === void 0 ? void 0 : data.overrides) || {});
    await ref.set(Object.assign(Object.assign({ companyId }, defaults), { updatedAt: FvFieldValue.serverTimestamp(), updatedBy: auth.uid, createdAt: snap.exists ? (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.createdAt) !== null && _b !== void 0 ? _b : FvFieldValue.serverTimestamp() : FvFieldValue.serverTimestamp() }), { merge: true });
    // Also backfill company baseCurrency if missing
    const companyRef = firestore.doc(`companies/${companyId}`);
    const companySnap = await companyRef.get();
    const company = companySnap.data();
    if (company && !company.baseCurrency) {
        await companyRef.set({ baseCurrency: defaults.currency, updatedAt: FvFieldValue.serverTimestamp() }, { merge: true });
    }
    await fvWriteAuditLog(companyId, 'SETTINGS', 'tax', 'UPDATE', auth.uid, snap.data(), defaults);
    return { success: true, created: !snap.exists, settings: defaults };
});
// ─────────────────────────────────────────────────────────────────────────────
// 2) Business date stampers (existing collections)
// ─────────────────────────────────────────────────────────────────────────────
exports.ensureBusinessFieldsOnExpenseCreate = functions.firestore
    .document('companies/{companyId}/dailyExpenses/{expenseId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt', 'recordedAt']);
});
exports.ensureBusinessFieldsOnIncomingCreate = functions.firestore
    .document('companies/{companyId}/incomingProducts/{incomingId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'incomeDate', 'createdAt', 'recordedAt']);
});
exports.ensureBusinessFieldsOnSaleCreate = functions.firestore
    .document('companies/{companyId}/sales/{saleId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt', 'recordedAt']);
});
exports.ensureBusinessFieldsOnAgriConsumptionCreate = functions.firestore
    .document('companies/{companyId}/agriConsumptions/{consumptionId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt']);
});
exports.ensureBusinessFieldsOnAgriBatchCreate = functions.firestore
    .document('companies/{companyId}/agriBatches/{batchId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['harvestDate', 'createdAt']);
});
exports.ensureBusinessFieldsOnSettlementCreate = functions.firestore
    .document('companies/{companyId}/settlements/{settlementId}')
    .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt']);
});
// ─────────────────────────────────────────────────────────────────────────────
// 3) VAT recompute triggers
// ─────────────────────────────────────────────────────────────────────────────
exports.recomputeSaleTaxAndTotals = functions.firestore
    .document('companies/{companyId}/sales/{saleId}')
    .onWrite(async (change, context) => {
    const after = change.after.data();
    if (!after)
        return;
    const companyId = context.params.companyId;
    // Prevent obvious infinite loops by checking if the fields that matter changed.
    const before = change.before.data() || {};
    const watchedChanged = before.quantity !== after.quantity ||
        before.salePrice !== after.salePrice ||
        before.salePriceCurrency !== after.salePriceCurrency ||
        before.productId !== after.productId ||
        before.discount !== after.discount ||
        JSON.stringify(before.fx || null) !== JSON.stringify(after.fx || null);
    // Still recompute on create if missing totals/vat
    const missingComputed = !after.vat || !after.totals || typeof after.businessDay !== 'number';
    if (!watchedChanged && !missingComputed)
        return;
    try {
        await fvRecomputeSaleVatAndTotals(companyId, change.after.ref, after);
    }
    catch (e) {
        console.error('[recomputeSaleTaxAndTotals] failed', e);
    }
});
exports.recomputeIncomingVatAndTotals = functions.firestore
    .document('companies/{companyId}/incomingProducts/{incomingId}')
    .onWrite(async (change, context) => {
    const after = change.after.data();
    if (!after)
        return;
    const before = change.before.data() || {};
    const companyId = context.params.companyId;
    const watchedChanged = before.totalCost !== after.totalCost ||
        before.totalCostMinor !== after.totalCostMinor ||
        before.currency !== after.currency ||
        before.productCode !== after.productCode ||
        before.productId !== after.productId ||
        before.vatCode !== after.vatCode;
    const missingComputed = !after.vat || typeof after.businessDay !== 'number';
    if (!watchedChanged && !missingComputed)
        return;
    try {
        await fvRecomputeIncomingVat(companyId, change.after.ref, after);
    }
    catch (e) {
        console.error('[recomputeIncomingVatAndTotals] failed', e);
    }
});
// ─────────────────────────────────────────────────────────────────────────────
// 4) Issue invoice for an existing sale
// ─────────────────────────────────────────────────────────────────────────────
exports.issueInvoiceForSale = functions.https.onCall(async (data, context) => {
    const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const saleId = data === null || data === void 0 ? void 0 : data.saleId;
    if (!saleId) {
        throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
    }
    const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
    const companyRef = firestore.doc(`companies/${companyId}`);
    const taxRef = firestore.doc(`companies/${companyId}/settings/tax`);
    const result = await firestore.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        const [saleSnap, companySnap, taxSnap] = await Promise.all([
            tx.get(saleRef),
            tx.get(companyRef),
            tx.get(taxRef),
        ]);
        if (!saleSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Sale not found');
        }
        if (!taxSnap.exists) {
            throw new functions.https.HttpsError('failed-precondition', 'Tax settings not found');
        }
        const sale = saleSnap.data();
        const company = (companySnap.data() || {});
        const tax = taxSnap.data();
        if ((_a = sale.invoice) === null || _a === void 0 ? void 0 : _a.invoiceId) {
            return {
                invoiceId: sale.invoice.invoiceId,
                invoiceNumber: sale.invoice.invoiceNumber,
                reused: true,
            };
        }
        // Make sure sale has VAT/totals snapshot
        // (Transaction can't call external writes, so we compute inline here)
        const qty = Number((_b = sale.quantity) !== null && _b !== void 0 ? _b : 0);
        const saleCurrency = (sale.salePriceCurrency || tax.currency);
        const unitPriceMinor = (0, money_1.toMinor)(Number((_c = sale.salePrice) !== null && _c !== void 0 ? _c : 0), saleCurrency);
        const discountMinor = (0, money_1.toMinor)(Number((_d = sale.discount) !== null && _d !== void 0 ? _d : 0), saleCurrency);
        const vatCode = sale.vatCode || tax.defaultVatCode;
        const vatRate = fvResolveVatRate(tax, vatCode);
        const netMinor = Math.max(0, qty * unitPriceMinor - discountMinor);
        const vatMinor = fvRoundMinor(netMinor * vatRate, tax.roundingMode);
        const grossMinor = netMinor + vatMinor;
        const paidTotal = Number((_g = (_f = (_e = sale.totals) === null || _e === void 0 ? void 0 : _e.paidTotal) !== null && _f !== void 0 ? _f : sale.paidMinor) !== null && _g !== void 0 ? _g : 0);
        const dueTotal = Math.max(0, grossMinor - paidTotal);
        const nextNumber = Number((_j = (_h = tax.invoiceProfile) === null || _h === void 0 ? void 0 : _h.nextNumber) !== null && _j !== void 0 ? _j : 1);
        const prefix = ((_k = tax.invoiceProfile) === null || _k === void 0 ? void 0 : _k.prefix) || 'INV';
        const padding = Number((_m = (_l = tax.invoiceProfile) === null || _l === void 0 ? void 0 : _l.padding) !== null && _m !== void 0 ? _m : 6);
        const invoiceNumber = fvPadInvoiceNumber(prefix, nextNumber, padding);
        const invoiceRef = firestore.collection(`companies/${companyId}/invoices`).doc();
        const businessDate = fvToBusinessDate(sale.businessDate || sale.date || sale.createdAt || null);
        const businessDay = fvToBusinessDay(businessDate);
        tx.set(invoiceRef, {
            companyId,
            sourceType: 'SALE',
            sourceId: saleId,
            invoiceNumber,
            status: 'ISSUED',
            country: tax.country,
            currency: saleCurrency,
            issueDate: FvFieldValue.serverTimestamp(),
            businessDate,
            businessDay,
            sellerSnapshot: {
                legalName: ((_o = tax.seller) === null || _o === void 0 ? void 0 : _o.legalName) || company.name || '',
                taxId: ((_p = tax.seller) === null || _p === void 0 ? void 0 : _p.taxId) || company.taxId || null,
                address: ((_q = tax.seller) === null || _q === void 0 ? void 0 : _q.address) || company.address || null,
            },
            buyerSnapshot: {
                name: sale.clientName || 'Walk-in Client',
                taxId: sale.clientTaxId || null,
                address: sale.clientAddress || null,
            },
            lineItems: [
                {
                    productId: sale.productId || null,
                    name: sale.productName || 'Item',
                    qty,
                    unitPriceMinor,
                    discountMinor,
                    vatCode,
                    vatRate,
                    netMinor,
                    vatMinor,
                    grossMinor,
                },
            ],
            totals: {
                netTotal: netMinor,
                vatTotal: vatMinor,
                grossTotal: grossMinor,
                paidTotal,
                dueTotal,
            },
            taxSummary: [{ code: vatCode, rate: vatRate, netMinor, vatMinor }],
            eInvoice: tax.country === 'SA'
                ? { system: 'ZATCA', status: 'READY' }
                : { system: null, status: 'NONE' },
            createdAt: FvFieldValue.serverTimestamp(),
            createdBy: auth.uid,
        });
        tx.update(taxRef, {
            'invoiceProfile.nextNumber': nextNumber + 1,
            updatedAt: FvFieldValue.serverTimestamp(),
        });
        tx.set(saleRef, {
            vatCode,
            vat: { code: vatCode, rate: vatRate, netMinor, vatMinor, grossMinor, currency: saleCurrency },
            taxSummary: [{ code: vatCode, rate: vatRate, netMinor, vatMinor }],
            totals: { netTotal: netMinor, vatTotal: vatMinor, grossTotal: grossMinor, paidTotal, dueTotal },
            businessDate,
            businessDay,
            invoice: {
                invoiceId: invoiceRef.id,
                invoiceNumber,
                issuedAt: FvFieldValue.serverTimestamp(),
                locked: true,
            },
            status: paidTotal >= grossMinor ? 'PAID' : paidTotal > 0 ? 'PARTIAL' : (sale.status || 'ISSUED'),
            updatedAt: FvFieldValue.serverTimestamp(),
        }, { merge: true });
        return { invoiceId: invoiceRef.id, invoiceNumber, reused: false };
    });
    await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, {
        action: 'ISSUE_INVOICE',
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
    });
    return Object.assign({ success: true }, result);
});
// ─────────────────────────────────────────────────────────────────────────────
// 5) "generateInvoicePdf" without extra dependency (stores printable HTML)
//    This avoids adding a PDF library right now. Frontend can open/print HTML.
// ─────────────────────────────────────────────────────────────────────────────
function fvInvoiceHtml(invoice) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const lines = (invoice.lineItems || [])
        .map((l) => {
        var _a, _b, _c, _d, _e;
        return `
      <tr>
        <td>${String(l.name || '')}</td>
        <td style="text-align:right">${(_a = l.qty) !== null && _a !== void 0 ? _a : 0}</td>
        <td style="text-align:right">${(_b = l.unitPriceMinor) !== null && _b !== void 0 ? _b : 0}</td>
        <td style="text-align:right">${(_c = l.netMinor) !== null && _c !== void 0 ? _c : 0}</td>
        <td style="text-align:right">${(_d = l.vatMinor) !== null && _d !== void 0 ? _d : 0}</td>
        <td style="text-align:right">${(_e = l.grossMinor) !== null && _e !== void 0 ? _e : 0}</td>
      </tr>
    `;
    })
        .join('');
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Invoice ${invoice.invoiceNumber}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 24px; }
  h1 { margin: 0 0 8px; }
  .meta { margin-bottom: 16px; color: #444; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
  th { background: #f6f6f6; }
  .totals { margin-top: 14px; width: 320px; margin-left: auto; }
  .totals td { border: none; padding: 4px 0; }
</style>
</head>
<body>
  <h1>Invoice ${invoice.invoiceNumber}</h1>
  <div class="meta">
    <div><b>Seller:</b> ${((_a = invoice.sellerSnapshot) === null || _a === void 0 ? void 0 : _a.legalName) || ''}</div>
    <div><b>Buyer:</b> ${((_b = invoice.buyerSnapshot) === null || _b === void 0 ? void 0 : _b.name) || ''}</div>
    <div><b>Currency:</b> ${invoice.currency || ''}</div>
    <div><b>Country:</b> ${invoice.country || ''}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Item</th><th>Qty</th><th>Unit</th><th>Net</th><th>VAT</th><th>Gross</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
  <table class="totals">
    <tr><td><b>Net</b></td><td style="text-align:right">${(_d = (_c = invoice.totals) === null || _c === void 0 ? void 0 : _c.netTotal) !== null && _d !== void 0 ? _d : 0}</td></tr>
    <tr><td><b>VAT</b></td><td style="text-align:right">${(_f = (_e = invoice.totals) === null || _e === void 0 ? void 0 : _e.vatTotal) !== null && _f !== void 0 ? _f : 0}</td></tr>
    <tr><td><b>Gross</b></td><td style="text-align:right">${(_h = (_g = invoice.totals) === null || _g === void 0 ? void 0 : _g.grossTotal) !== null && _h !== void 0 ? _h : 0}</td></tr>
  </table>
  <p style="margin-top:18px;color:#666">Stored by FlowVia Cloud Functions (printable HTML version).</p>
</body>
</html>`;
}
exports.generateInvoicePdf = functions.https.onCall(async (data, context) => {
    const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const invoiceId = data === null || data === void 0 ? void 0 : data.invoiceId;
    if (!invoiceId) {
        throw new functions.https.HttpsError('invalid-argument', 'invoiceId is required');
    }
    const invoiceRef = firestore.doc(`companies/${companyId}/invoices/${invoiceId}`);
    const snap = await invoiceRef.get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('not-found', 'Invoice not found');
    }
    const invoice = snap.data();
    const html = fvInvoiceHtml(invoice);
    const bucket = admin.storage().bucket();
    const path = `companies/${companyId}/invoices/${invoiceId}.html`; // printable now; convert to PDF later
    await bucket.file(path).save(html, { contentType: 'text/html; charset=utf-8' });
    await invoiceRef.set({
        printable: { storagePath: path, generatedAt: FvFieldValue.serverTimestamp(), format: 'html' },
        updatedAt: FvFieldValue.serverTimestamp(),
    }, { merge: true });
    await fvWriteAuditLog(companyId, 'INVOICE', invoiceId, 'UPDATE', auth.uid, undefined, {
        action: 'GENERATE_PRINTABLE',
        storagePath: path,
    });
    return { success: true, storagePath: path, format: 'html' };
});
// ─────────────────────────────────────────────────────────────────────────────
// 6) VAT return generator (uses sales + incomingProducts)
// ─────────────────────────────────────────────────────────────────────────────
exports.generateVatReturn = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    const auth = fvRequireRole(context, 'admin', 'accounting', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const period = data === null || data === void 0 ? void 0 : data.period;
    if (!period) {
        throw new functions.https.HttpsError('invalid-argument', 'period is required (YYYY-MM)');
    }
    const tax = await fvLoadTaxSettings(companyId);
    const { startDate, endDate, startDay, endDay } = fvMonthRange(period);
    const [salesSnap, incomingSnap] = await Promise.all([
        firestore
            .collection(`companies/${companyId}/sales`)
            .where('businessDay', '>=', startDay)
            .where('businessDay', '<=', endDay)
            .get(),
        firestore
            .collection(`companies/${companyId}/incomingProducts`)
            .where('businessDay', '>=', startDay)
            .where('businessDay', '<=', endDay)
            .get(),
    ]);
    const outputByCode = {};
    let outputVatMinor = 0;
    for (const doc of salesSnap.docs) {
        const s = doc.data();
        if (s.status === 'CANCELLED')
            continue;
        const vatCode = ((_a = s.vat) === null || _a === void 0 ? void 0 : _a.code) || s.vatCode || tax.defaultVatCode;
        const netMinor = Number((_e = (_c = (_b = s.vat) === null || _b === void 0 ? void 0 : _b.netMinor) !== null && _c !== void 0 ? _c : (_d = s.totals) === null || _d === void 0 ? void 0 : _d.netTotal) !== null && _e !== void 0 ? _e : 0);
        const vatMinor = Number((_j = (_g = (_f = s.vat) === null || _f === void 0 ? void 0 : _f.vatMinor) !== null && _g !== void 0 ? _g : (_h = s.totals) === null || _h === void 0 ? void 0 : _h.vatTotal) !== null && _j !== void 0 ? _j : 0);
        if (!outputByCode[vatCode])
            outputByCode[vatCode] = { netMinor: 0, vatMinor: 0 };
        outputByCode[vatCode].netMinor += netMinor;
        outputByCode[vatCode].vatMinor += vatMinor;
        outputVatMinor += vatMinor;
    }
    const inputByCode = {};
    let inputVatMinor = 0;
    for (const doc of incomingSnap.docs) {
        const p = doc.data();
        const vatCode = ((_k = p.vat) === null || _k === void 0 ? void 0 : _k.code) || p.vatCode || tax.defaultVatCode;
        const netMinor = Number((_o = (_m = (_l = p.vat) === null || _l === void 0 ? void 0 : _l.netTotalMinor) !== null && _m !== void 0 ? _m : p.totalCostMinor) !== null && _o !== void 0 ? _o : 0);
        const vatMinor = Number((_q = (_p = p.vat) === null || _p === void 0 ? void 0 : _p.vatTotalMinor) !== null && _q !== void 0 ? _q : 0);
        if (!inputByCode[vatCode])
            inputByCode[vatCode] = { netMinor: 0, vatMinor: 0 };
        inputByCode[vatCode].netMinor += netMinor;
        inputByCode[vatCode].vatMinor += vatMinor;
        inputVatMinor += vatMinor;
    }
    const netVatMinor = outputVatMinor - inputVatMinor;
    const payload = {
        companyId,
        period,
        startDate,
        endDate,
        country: tax.country,
        currency: tax.currency,
        outputVat: {
            byCode: outputByCode,
            totalVatMinor: outputVatMinor,
        },
        inputVat: {
            byCode: inputByCode,
            totalVatMinor: inputVatMinor,
        },
        netVatMinor,
        sources: {
            salesCount: salesSnap.size,
            incomingProductsCount: incomingSnap.size,
        },
        generatedAt: FvFieldValue.serverTimestamp(),
        generatedBy: auth.uid,
    };
    await firestore.doc(`companies/${companyId}/vatReturns/${period}`).set(payload, { merge: true });
    await fvWriteAuditLog(companyId, 'VAT_RETURN', period, 'CREATE', auth.uid, undefined, {
        netVatMinor,
        period,
    });
    return Object.assign(Object.assign({ success: true }, payload), { generatedAt: undefined, generatedBy: auth.uid });
});
// ─────────────────────────────────────────────────────────────────────────────
// 7) Basic sales adjustment (simple, audited correction path)
// ─────────────────────────────────────────────────────────────────────────────
exports.createSalesAdjustment = functions.https.onCall(async (data, context) => {
    var _a;
    const auth = fvRequireRole(context, 'admin', 'accounting', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const saleId = data === null || data === void 0 ? void 0 : data.saleId;
    const grossAdjustmentMinor = Number((_a = data === null || data === void 0 ? void 0 : data.grossAdjustmentMinor) !== null && _a !== void 0 ? _a : 0); // negative for credit, positive for debit
    const reason = String((data === null || data === void 0 ? void 0 : data.reason) || '').trim();
    if (!saleId || !Number.isFinite(grossAdjustmentMinor) || grossAdjustmentMinor === 0 || !reason) {
        throw new functions.https.HttpsError('invalid-argument', 'saleId, grossAdjustmentMinor (non-zero), and reason are required');
    }
    const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
    const tax = await fvLoadTaxSettings(companyId);
    const result = await firestore.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Sale not found');
        const sale = saleSnap.data();
        if (!((_a = sale.invoice) === null || _a === void 0 ? void 0 : _a.invoiceId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Issue invoice first before adjustment');
        }
        const currentGross = Number((_e = (_c = (_b = sale.totals) === null || _b === void 0 ? void 0 : _b.grossTotal) !== null && _c !== void 0 ? _c : (_d = sale.vat) === null || _d === void 0 ? void 0 : _d.grossMinor) !== null && _e !== void 0 ? _e : 0);
        const currentVat = Number((_j = (_g = (_f = sale.totals) === null || _f === void 0 ? void 0 : _f.vatTotal) !== null && _g !== void 0 ? _g : (_h = sale.vat) === null || _h === void 0 ? void 0 : _h.vatMinor) !== null && _j !== void 0 ? _j : 0);
        const currentNet = Number((_o = (_l = (_k = sale.totals) === null || _k === void 0 ? void 0 : _k.netTotal) !== null && _l !== void 0 ? _l : (_m = sale.vat) === null || _m === void 0 ? void 0 : _m.netMinor) !== null && _o !== void 0 ? _o : 0);
        const paidTotal = Number((_q = (_p = sale.totals) === null || _p === void 0 ? void 0 : _p.paidTotal) !== null && _q !== void 0 ? _q : 0);
        const vatRate = Number((_s = (_r = sale.vat) === null || _r === void 0 ? void 0 : _r.rate) !== null && _s !== void 0 ? _s : fvResolveVatRate(tax, ((_t = sale.vat) === null || _t === void 0 ? void 0 : _t.code) || sale.vatCode));
        // If gross adjustment passed, derive net/vat proportionally using current tax ratio (best-effort)
        const netAdjustmentMinor = fvRoundMinor(grossAdjustmentMinor / (1 + vatRate), tax.roundingMode);
        const vatAdjustmentMinor = grossAdjustmentMinor - netAdjustmentMinor;
        const newNet = Math.max(0, currentNet + netAdjustmentMinor);
        const newVat = Math.max(0, currentVat + vatAdjustmentMinor);
        const newGross = Math.max(0, currentGross + grossAdjustmentMinor);
        const newDue = Math.max(0, newGross - paidTotal);
        const adjRef = firestore.collection(`companies/${companyId}/saleAdjustments`).doc();
        tx.set(adjRef, {
            companyId,
            saleId,
            invoiceId: sale.invoice.invoiceId,
            invoiceNumber: sale.invoice.invoiceNumber,
            reason,
            grossAdjustmentMinor,
            netAdjustmentMinor,
            vatAdjustmentMinor,
            currency: ((_u = sale.vat) === null || _u === void 0 ? void 0 : _u.currency) || sale.salePriceCurrency || tax.currency,
            createdAt: FvFieldValue.serverTimestamp(),
            createdBy: auth.uid,
            businessDate: fvToBusinessDate(null),
            businessDay: fvToBusinessDay(fvToBusinessDate(null)),
        });
        tx.update(saleRef, {
            'totals.netTotal': newNet,
            'totals.vatTotal': newVat,
            'totals.grossTotal': newGross,
            'totals.dueTotal': newDue,
            'vat.netMinor': newNet,
            'vat.vatMinor': newVat,
            'vat.grossMinor': newGross,
            status: paidTotal >= newGross ? 'PAID' : paidTotal > 0 ? 'PARTIAL' : 'ISSUED',
            updatedAt: FvFieldValue.serverTimestamp(),
        });
        return { adjustmentId: adjRef.id, newNet, newVat, newGross, newDue };
    });
    await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, Object.assign(Object.assign({ action: 'ADJUST' }, result), { reason }));
    return Object.assign({ success: true }, result);
});
// ─────────────────────────────────────────────────────────────────────────────
// 8) Agri / Palm pack callables
// ─────────────────────────────────────────────────────────────────────────────
exports.createHarvestBatch = functions.https.onCall(async (data, context) => {
    const auth = fvRequireRole(context, 'admin', 'manager', 'accounting', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const { seasonId, fieldId, harvestDate, qty, unit = 'kg', grade = 'A', crop = 'DATES', storageLocation = null, } = data || {};
    if (!seasonId || !fieldId || !Number.isFinite(Number(qty)) || Number(qty) <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'seasonId, fieldId, and positive qty are required');
    }
    const businessDate = fvToBusinessDate(harvestDate || null);
    const businessDay = fvToBusinessDay(businessDate);
    const ref = await firestore.collection(`companies/${companyId}/agriBatches`).add({
        companyId,
        seasonId,
        fieldId,
        harvestDate: harvestDate ? admin.firestore.Timestamp.fromDate(new Date(harvestDate)) : FvFieldValue.serverTimestamp(),
        businessDate,
        businessDay,
        crop,
        grade,
        qtyHarvested: Number(qty),
        unit,
        storageLocation,
        status: 'OPEN',
        createdAt: FvFieldValue.serverTimestamp(),
        createdBy: auth.uid,
    });
    await fvWriteAuditLog(companyId, 'AGRI_BATCH', ref.id, 'CREATE', auth.uid, undefined, {
        seasonId,
        fieldId,
        qty,
        unit,
        grade,
    });
    return { success: true, batchId: ref.id };
});
exports.recordAgriConsumption = functions.https.onCall(async (data, context) => {
    var _a;
    const auth = fvRequireRole(context, 'admin', 'manager', 'accounting', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const { seasonId, fieldId, date, lines, decrementInventory = false } = data || {};
    if (!seasonId || !fieldId || !Array.isArray(lines) || lines.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'seasonId, fieldId, and lines[] are required');
    }
    const businessDate = fvToBusinessDate(date || null);
    const businessDay = fvToBusinessDay(businessDate);
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    const companyBaseCurrency = (((_a = companySnap.data()) === null || _a === void 0 ? void 0 : _a.baseCurrency) || 'USD');
    const preparedLines = [];
    let totalCostMinor = 0;
    await firestore.runTransaction(async (tx) => {
        var _a, _b, _c, _d;
        for (const line of lines) {
            const productId = String(line.productId || '');
            const qty = Number((_a = line.qty) !== null && _a !== void 0 ? _a : 0);
            if (!productId || !Number.isFinite(qty) || qty <= 0) {
                throw new functions.https.HttpsError('invalid-argument', 'Each line needs productId and positive qty');
            }
            const productRef = firestore.doc(`companies/${companyId}/products/${productId}`);
            const productSnap = await tx.get(productRef);
            if (!productSnap.exists) {
                throw new functions.https.HttpsError('not-found', `Product not found: ${productId}`);
            }
            const p = productSnap.data();
            const unit = p.unit || line.unit || 'unit';
            const costPerUnitBaseMinor = Number((_b = p.costBaseMinor) !== null && _b !== void 0 ? _b : 0) ||
                (p.purchasePriceCurrency && p.costMinor && companyBaseCurrency && ((_c = p.costFx) === null || _c === void 0 ? void 0 : _c.rateToBase)
                    ? (0, money_1.convertMinorToBase)(Number(p.costMinor), Number(p.costFx.rateToBase), p.purchasePriceCurrency, companyBaseCurrency)
                    : 0);
            const costTotalMinor = fvRoundMinor(qty * costPerUnitBaseMinor, 'HALF_UP');
            totalCostMinor += costTotalMinor;
            preparedLines.push({
                productId,
                productCode: p.productCode || null,
                nameSnapshot: p.name || line.name || 'Item',
                qty,
                unit,
                costPerUnitSnapshot: costPerUnitBaseMinor,
                costCurrency: companyBaseCurrency,
                costTotal: costTotalMinor,
            });
            if (decrementInventory === true) {
                const currentQty = Number((_d = p.quantity) !== null && _d !== void 0 ? _d : 0);
                tx.update(productRef, {
                    quantity: currentQty - qty, // can go negative if you allow it
                    updatedAt: FvFieldValue.serverTimestamp(),
                });
                const invRef = firestore.collection(`companies/${companyId}/inventoryLogs`).doc();
                tx.set(invRef, {
                    companyId,
                    productId,
                    productCode: p.productCode || null,
                    changeQuantity: -qty,
                    reason: 'Agri Consumption',
                    changeDate: FvFieldValue.serverTimestamp(),
                    logDate: businessDate,
                    businessDate,
                    businessDay,
                    seasonId,
                    fieldId,
                    createdBy: auth.uid,
                });
            }
        }
        const consRef = firestore.collection(`companies/${companyId}/agriConsumptions`).doc();
        tx.set(consRef, {
            companyId,
            seasonId,
            fieldId,
            date: date ? admin.firestore.Timestamp.fromDate(new Date(date)) : FvFieldValue.serverTimestamp(),
            businessDate,
            businessDay,
            lines: preparedLines,
            totalCost: totalCostMinor,
            currency: companyBaseCurrency,
            createdAt: FvFieldValue.serverTimestamp(),
            createdBy: auth.uid,
        });
        // Rolling season cost
        const seasonRef = firestore.doc(`companies/${companyId}/agriSeasons/${seasonId}`);
        tx.set(seasonRef, {
            updatedAt: FvFieldValue.serverTimestamp(),
            totalCostMinor: FvFieldValue.increment(totalCostMinor),
        }, { merge: true });
    });
    await fvWriteAuditLog(companyId, 'AGRI_CONSUMPTION', `${seasonId}:${businessDate}`, 'CREATE', auth.uid, undefined, {
        seasonId,
        fieldId,
        totalCostMinor,
        linesCount: preparedLines.length,
    });
    return { success: true, totalCostMinor, currency: companyBaseCurrency };
});
exports.confirmSettlement = functions.https.onCall(async (data, context) => {
    const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const saleId = data === null || data === void 0 ? void 0 : data.saleId;
    const deductions = Array.isArray(data === null || data === void 0 ? void 0 : data.deductions) ? data.deductions : [];
    const date = data === null || data === void 0 ? void 0 : data.date;
    if (!saleId) {
        throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
    }
    const normalizedDeductions = deductions.map((d) => {
        var _a;
        return ({
            type: String(d.type || 'OTHER'),
            amountMinor: Number((_a = d.amountMinor) !== null && _a !== void 0 ? _a : 0),
            note: d.note ? String(d.note) : null,
        });
    });
    if (normalizedDeductions.some((d) => !Number.isFinite(d.amountMinor) || d.amountMinor < 0)) {
        throw new functions.https.HttpsError('invalid-argument', 'All deduction amounts must be >= 0');
    }
    const dedTotal = normalizedDeductions.reduce((sum, d) => sum + d.amountMinor, 0);
    const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
    const businessDate = fvToBusinessDate(date || null);
    const businessDay = fvToBusinessDay(businessDate);
    const result = await firestore.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const saleSnap = await tx.get(saleRef);
        if (!saleSnap.exists)
            throw new functions.https.HttpsError('not-found', 'Sale not found');
        const sale = saleSnap.data();
        const grossAmount = Number((_e = (_d = (_b = (_a = sale.totals) === null || _a === void 0 ? void 0 : _a.grossTotal) !== null && _b !== void 0 ? _b : (_c = sale.vat) === null || _c === void 0 ? void 0 : _c.grossMinor) !== null && _d !== void 0 ? _d : sale.revenueMinor) !== null && _e !== void 0 ? _e : 0);
        const paidTotal = Number((_g = (_f = sale.totals) === null || _f === void 0 ? void 0 : _f.paidTotal) !== null && _g !== void 0 ? _g : 0);
        const netPayable = Math.max(0, grossAmount - dedTotal);
        const dueTotal = Math.max(0, netPayable - paidTotal);
        const settlementRef = firestore.collection(`companies/${companyId}/settlements`).doc();
        tx.set(settlementRef, {
            companyId,
            saleId,
            clientId: sale.clientId || null,
            seasonId: sale.seasonId || ((_h = sale.agri) === null || _h === void 0 ? void 0 : _h.seasonId) || null,
            fieldId: sale.fieldId || ((_j = sale.agri) === null || _j === void 0 ? void 0 : _j.fieldId) || null,
            batchId: sale.batchId || ((_k = sale.agri) === null || _k === void 0 ? void 0 : _k.batchId) || null,
            currency: ((_l = sale.vat) === null || _l === void 0 ? void 0 : _l.currency) || sale.salePriceCurrency || 'USD',
            date: date ? admin.firestore.Timestamp.fromDate(new Date(date)) : FvFieldValue.serverTimestamp(),
            businessDate,
            businessDay,
            grossAmount,
            deductions: normalizedDeductions,
            deductionsTotalMinor: dedTotal,
            netAmount: netPayable,
            status: 'CONFIRMED',
            createdAt: FvFieldValue.serverTimestamp(),
            createdBy: auth.uid,
        });
        tx.set(saleRef, {
            settlement: {
                settlementId: settlementRef.id,
                deductionsTotalMinor: dedTotal,
                netPayableMinor: netPayable,
                confirmedAt: FvFieldValue.serverTimestamp(),
            },
            'totals.dueTotal': dueTotal,
            updatedAt: FvFieldValue.serverTimestamp(),
        }, { merge: true });
        // Optional client ledger adjustment entry (keeps debt sheet accurate)
        if (sale.clientId && dedTotal > 0) {
            const clientLedgerRef = firestore.collection(`companies/${companyId}/clients/${sale.clientId}/ledger`).doc();
            tx.set(clientLedgerRef, {
                companyId,
                clientId: sale.clientId,
                type: 'adjustment',
                currency: ((_m = sale.vat) === null || _m === void 0 ? void 0 : _m.currency) || sale.salePriceCurrency || 'USD',
                totalMinor: -dedTotal,
                paidMinor: 0,
                dueMinor: 0,
                relatedSaleId: saleId,
                note: `Settlement deductions applied (${normalizedDeductions.length} items)`,
                createdAt: FvFieldValue.serverTimestamp(),
            });
        }
        return { settlementId: settlementRef.id, grossAmount, deductionsTotalMinor: dedTotal, netPayable, dueTotal };
    });
    await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, Object.assign({ action: 'CONFIRM_SETTLEMENT' }, result));
    return Object.assign({ success: true }, result);
});
// ─────────────────────────────────────────────────────────────────────────────
// 9) Agri season P&L export (JSON snapshot)
// ─────────────────────────────────────────────────────────────────────────────
exports.exportSeasonPnl = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
    const companyId = fvGetCompanyId(context, data);
    const seasonId = data === null || data === void 0 ? void 0 : data.seasonId;
    if (!seasonId) {
        throw new functions.https.HttpsError('invalid-argument', 'seasonId is required');
    }
    const [seasonSnap, consumptionsSnap, salesSnap, settlementsSnap] = await Promise.all([
        firestore.doc(`companies/${companyId}/agriSeasons/${seasonId}`).get(),
        firestore.collection(`companies/${companyId}/agriConsumptions`).where('seasonId', '==', seasonId).get(),
        firestore.collection(`companies/${companyId}/sales`).get(), // filter in memory for compatibility with current schema
        firestore.collection(`companies/${companyId}/settlements`).where('seasonId', '==', seasonId).get(),
    ]);
    if (!seasonSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Season not found');
    }
    let totalConsumptionCostMinor = 0;
    const costsByField = {};
    for (const doc of consumptionsSnap.docs) {
        const d = doc.data();
        const c = Number((_a = d.totalCost) !== null && _a !== void 0 ? _a : 0);
        totalConsumptionCostMinor += c;
        const fieldId = d.fieldId || 'unknown';
        costsByField[fieldId] = (costsByField[fieldId] || 0) + c;
    }
    let grossRevenueMinor = 0;
    let vatRevenueMinor = 0;
    let netRevenueMinor = 0;
    let totalQtySold = 0;
    const revenueByBuyer = {};
    const revenueByGrade = {};
    for (const doc of salesSnap.docs) {
        const s = doc.data();
        if (s.status === 'CANCELLED')
            continue;
        const saleSeasonId = s.seasonId ||
            ((_b = s.agri) === null || _b === void 0 ? void 0 : _b.seasonId) ||
            (Array.isArray(s.lines) ? (_c = s.lines.find((l) => l.seasonId)) === null || _c === void 0 ? void 0 : _c.seasonId : null);
        if (saleSeasonId !== seasonId)
            continue;
        const gross = Number((_h = (_g = (_e = (_d = s.totals) === null || _d === void 0 ? void 0 : _d.grossTotal) !== null && _e !== void 0 ? _e : (_f = s.vat) === null || _f === void 0 ? void 0 : _f.grossMinor) !== null && _g !== void 0 ? _g : s.revenueMinor) !== null && _h !== void 0 ? _h : 0);
        const vat = Number((_m = (_k = (_j = s.totals) === null || _j === void 0 ? void 0 : _j.vatTotal) !== null && _k !== void 0 ? _k : (_l = s.vat) === null || _l === void 0 ? void 0 : _l.vatMinor) !== null && _m !== void 0 ? _m : 0);
        const net = Number((_p = (_o = s.totals) === null || _o === void 0 ? void 0 : _o.netTotal) !== null && _p !== void 0 ? _p : Math.max(0, gross - vat));
        grossRevenueMinor += gross;
        vatRevenueMinor += vat;
        netRevenueMinor += net;
        const qty = Number((_q = s.quantity) !== null && _q !== void 0 ? _q : 0);
        totalQtySold += qty;
        const buyer = s.clientName || 'Unknown Buyer';
        revenueByBuyer[buyer] = (revenueByBuyer[buyer] || 0) + gross;
        const grade = s.grade || ((_r = s.agri) === null || _r === void 0 ? void 0 : _r.grade) || 'N/A';
        revenueByGrade[grade] = (revenueByGrade[grade] || 0) + gross;
    }
    let settlementDeductionsMinor = 0;
    for (const doc of settlementsSnap.docs) {
        settlementDeductionsMinor += Number((_s = doc.data().deductionsTotalMinor) !== null && _s !== void 0 ? _s : 0);
    }
    const effectiveRevenueMinor = Math.max(0, grossRevenueMinor - settlementDeductionsMinor);
    const grossProfitMinor = effectiveRevenueMinor - totalConsumptionCostMinor;
    const costPerKgMinor = totalQtySold > 0 ? fvRoundMinor(totalConsumptionCostMinor / totalQtySold, 'HALF_UP') : 0;
    const report = {
        companyId,
        seasonId,
        seasonName: ((_t = seasonSnap.data()) === null || _t === void 0 ? void 0 : _t.name) || seasonId,
        generatedAt: FvFieldValue.serverTimestamp(),
        generatedBy: auth.uid,
        summary: {
            grossRevenueMinor,
            vatRevenueMinor,
            netRevenueMinor,
            settlementDeductionsMinor,
            effectiveRevenueMinor,
            totalConsumptionCostMinor,
            grossProfitMinor,
            totalQtySold,
            costPerKgMinor,
        },
        breakdowns: {
            costsByField,
            revenueByBuyer,
            revenueByGrade,
        },
        counts: {
            consumptions: consumptionsSnap.size,
            settlements: settlementsSnap.size,
        },
    };
    const reportRef = firestore.collection(`companies/${companyId}/agriReports`).doc(`season_${seasonId}`);
    await reportRef.set(report, { merge: true });
    await fvWriteAuditLog(companyId, 'AGRI_REPORT', reportRef.id, 'CREATE', auth.uid, undefined, {
        seasonId,
        grossProfitMinor,
    });
    return { success: true, reportId: reportRef.id, report };
});
// ─────────────────────────────────────────────────────────────────────────────
// 10) Optional trigger: keep agri season totalCost in sync when consumptions edited
// ─────────────────────────────────────────────────────────────────────────────
exports.onAgriConsumptionWriteRecomputeSeasonTotal = functions.firestore
    .document('companies/{companyId}/agriConsumptions/{consumptionId}')
    .onWrite(async (change, context) => {
    var _a, _b;
    const companyId = context.params.companyId;
    const before = change.before.data();
    const after = change.after.data();
    const beforeSeasonId = before === null || before === void 0 ? void 0 : before.seasonId;
    const afterSeasonId = after === null || after === void 0 ? void 0 : after.seasonId;
    // If deleted or season moved, simplest safe path is to do nothing here.
    // (You can add a full season total recompute callable later.)
    if (!after || !afterSeasonId)
        return;
    const beforeTotal = Number((_a = before === null || before === void 0 ? void 0 : before.totalCost) !== null && _a !== void 0 ? _a : 0);
    const afterTotal = Number((_b = after === null || after === void 0 ? void 0 : after.totalCost) !== null && _b !== void 0 ? _b : 0);
    const delta = afterTotal - beforeTotal;
    if (!delta)
        return;
    try {
        await firestore.doc(`companies/${companyId}/agriSeasons/${afterSeasonId}`).set({
            totalCostMinor: FvFieldValue.increment(delta),
            updatedAt: FvFieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (e) {
        console.error('[onAgriConsumptionWriteRecomputeSeasonTotal] failed', e);
    }
});
//# sourceMappingURL=index.js.map