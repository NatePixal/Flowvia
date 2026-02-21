// functions/src/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { UserRole, Currency } from './types';
import { toMinor, convertMinorToBase, convertBaseToMinor } from './money';

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
export { exportStatement } from './exports';

// Export functions for data maintenance and one-off scripts
export * from './maintenance';

// Export functions for core financial recalculations and compatibility stubs
export * from './financials';

// ─────────────────────────────────────────────────────────────────────────────
// FLOWVIA MENA PACK — Additive backend functions (append below existing code)
// ─────────────────────────────────────────────────────────────────────────────

type FvVatCode = 'STD' | 'ZERO' | 'EXEMPT';
type FvRoundingMode = 'HALF_UP' | 'BANKERS' | 'DOWN';

type FvTaxSettings = {
  country: 'AE' | 'SA' | 'JO' | 'EG';
  currency: Currency;
  vatEnabled: boolean;
  vatRates: Array<{ code: FvVatCode | string; rate: number | null; label: string }>;
  defaultVatCode: FvVatCode | string;
  roundingMode: FvRoundingMode;
  invoiceProfile: {
    enabled: boolean;
    prefix: string;
    nextNumber: number;
    padding: number;
  };
  seller?: {
    legalName?: string;
    taxId?: string;
    address?: string;
  };
  eInvoicing?: {
    system: 'ZATCA' | null;
    phase: 'READY_ONLY' | 'INTEGRATED';
  };
};

const FvFieldValue = admin.firestore.FieldValue;

function fvRequireAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  return context.auth;
}

function fvRequireRole(
  context: functions.https.CallableContext,
  ...roles: UserRole[]
) {
  const auth = fvRequireAuth(context);
  const role = (auth.token.role as UserRole) ?? 'sales';
  if (!roles.includes(role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      `Requires one of roles: ${roles.join(', ')}`
    );
  }
  return auth;
}

function fvGetCompanyId(context: functions.https.CallableContext, data: any): string {
  const auth = fvRequireAuth(context);
  const role = (auth.token.role as UserRole) ?? 'sales';
  const claimCompanyId = (auth.token as any).companyId as string | undefined;
  const requested = data?.companyId as string | undefined;

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

function fvToBusinessDate(value: any): string {
  let d: Date;
  if (!value) d = new Date();
  else if (value instanceof admin.firestore.Timestamp) d = value.toDate();
  else if (value instanceof Date) d = value;
  else d = new Date(value);
  if (isNaN(d.getTime())) d = new Date();
  return d.toISOString().slice(0, 10);
}

function fvToBusinessDay(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

function fvRoundMinor(value: number, mode: FvRoundingMode = 'HALF_UP'): number {
  if (!Number.isFinite(value)) return 0;
  switch (mode) {
    case 'DOWN':
      return Math.floor(value);
    case 'BANKERS': {
      const floor = Math.floor(value);
      const frac = value - floor;
      if (Math.abs(frac - 0.5) < 1e-9) return floor % 2 === 0 ? floor : floor + 1;
      return Math.round(value);
    }
    case 'HALF_UP':
    default:
      return Math.round(value);
  }
}

async function fvWriteAuditLog(
  companyId: string,
  entityType: string,
  entityId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CANCEL',
  uid: string,
  before?: any,
  after?: any
): Promise<void> {
  try {
    await firestore.collection(`companies/${companyId}/auditLogs`).add({
      entityType,
      entityId,
      action,
      before: before ?? null,
      after: after ?? null,
      uid,
      timestamp: FvFieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[fvWriteAuditLog] non-fatal error', e);
  }
}

function fvDefaultTaxSettings(
  country: 'AE' | 'SA' | 'JO' | 'EG',
  overrides?: Partial<FvTaxSettings>
): FvTaxSettings {
  const currencyByCountry: Record<string, Currency> = {
    AE: 'AED',
    SA: 'SAR',
    JO: 'JOD',
    EG: 'EGP',
  };

  // Editable defaults — you can update these per company from the UI later.
  const rateByCountry: Record<string, number> = {
    AE: 0.05,
    SA: 0.15,
    JO: 0.16, // verify category-specific rules in your accountant setup
    EG: 0.14,
  };

  const vatRates = [
    { code: 'STD', rate: rateByCountry[country] ?? 0, label: 'Standard' },
    { code: 'ZERO', rate: 0, label: 'Zero-rated' },
    { code: 'EXEMPT', rate: null, label: 'Exempt' },
  ];

  return {
    country,
    currency: currencyByCountry[country] ?? 'USD',
    vatEnabled: true,
    vatRates,
    defaultVatCode: 'STD',
    roundingMode: 'HALF_UP',
    invoiceProfile: {
      enabled: true,
      prefix: 'INV',
      nextNumber: 1,
      padding: 6,
    },
    seller: {},
    eInvoicing: country === 'SA'
      ? { system: 'ZATCA', phase: 'READY_ONLY' }
      : { system: null, phase: 'READY_ONLY' },
    ...overrides,
  };
}

async function fvLoadTaxSettings(companyId: string): Promise<FvTaxSettings> {
  const ref = firestore.doc(`companies/${companyId}/settings/tax`);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Tax settings not found. Run ensureTaxSettingsExists first.'
    );
  }
  return snap.data() as FvTaxSettings;
}

function fvResolveVatRate(settings: FvTaxSettings, vatCode?: string): number {
  if (!settings.vatEnabled) return 0;
  const code = vatCode || settings.defaultVatCode || 'STD';
  const row = settings.vatRates.find(r => r.code === code);
  return row?.rate ?? 0;
}

async function fvInferProductVatCode(
  companyId: string,
  productId?: string,
  fallbackCode?: string
): Promise<string | undefined> {
  if (fallbackCode) return fallbackCode;
  if (!productId) return undefined;
  const snap = await firestore.doc(`companies/${companyId}/products/${productId}`).get();
  if (!snap.exists) return undefined;
  const product = snap.data() as any;
  return product.vatCode;
}

function fvComputeVatAmountsFromNet(
  netMinor: number,
  vatRate: number,
  rounding: FvRoundingMode
) {
  const vatMinor = fvRoundMinor(netMinor * vatRate, rounding);
  return {
    netMinor,
    vatMinor,
    grossMinor: netMinor + vatMinor,
  };
}

function fvPadInvoiceNumber(prefix: string, nextNumber: number, padding: number): string {
  return `${prefix}-${String(nextNumber).padStart(padding, '0')}`;
}

function fvMonthRange(period: string): { startDate: string; endDate: string; startDay: number; endDay: number } {
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

async function fvStampBusinessFieldsIfMissing(
  ref: admin.firestore.DocumentReference,
  data: any,
  dateCandidates: string[]
): Promise<void> {
  const hasBusinessFields = typeof data?.businessDate === 'string' && typeof data?.businessDay === 'number';
  if (hasBusinessFields) return;

  let rawDate: any = null;
  for (const k of dateCandidates) {
    if (data?.[k]) {
      rawDate = data[k];
      break;
    }
  }

  const businessDate = fvToBusinessDate(rawDate);
  const businessDay = fvToBusinessDay(businessDate);
  await ref.set(
    {
      businessDate,
      businessDay,
      updatedAt: FvFieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function fvRecomputeSaleVatAndTotals(companyId: string, saleRef: admin.firestore.DocumentReference, saleData: any) {
  const settings = await fvLoadTaxSettings(companyId);

  const qty = Number(saleData.quantity ?? 0);
  const saleCurrency = (saleData.salePriceCurrency || settings.currency) as Currency;
  const unitPriceMajor = Number(saleData.salePrice ?? 0);
  const unitPriceMinor = toMinor(unitPriceMajor, saleCurrency);

  const discountMajor = Number(saleData.discount ?? 0);
  const discountMinor = toMinor(discountMajor, saleCurrency);

  const vatCode = (await fvInferProductVatCode(companyId, saleData.productId, saleData.vatCode)) || settings.defaultVatCode;
  const vatRate = fvResolveVatRate(settings, vatCode);

  const netMinorRaw = Math.max(0, qty * unitPriceMinor - discountMinor);
  const computed = fvComputeVatAmountsFromNet(netMinorRaw, vatRate, settings.roundingMode);

  const paidTotal = Number(saleData.totals?.paidTotal ?? saleData.paidMinor ?? 0);
  const dueTotal = Math.max(0, computed.grossMinor - paidTotal);

  // Optional base currency conversion for consolidated reporting
  const baseCurrency = (saleData.baseCurrency || (await firestore.doc(`companies/${companyId}`).get()).data()?.baseCurrency || saleCurrency) as Currency;
  let revenueBaseMinor = saleData.revenueBaseMinor;
  if (saleCurrency === baseCurrency) {
    revenueBaseMinor = computed.grossMinor;
  } else if (saleData.fx?.rateToBase) {
    revenueBaseMinor = convertMinorToBase(computed.grossMinor, saleData.fx.rateToBase, saleCurrency, baseCurrency);
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
    revenueBaseMinor: revenueBaseMinor ?? saleData.revenueBaseMinor ?? null,
    updatedAt: FvFieldValue.serverTimestamp(),
  };

  // Stamp business fields too (sales use different date aliases in your app)
  const businessDate = fvToBusinessDate(saleData.date || saleData.recordedAt || saleData.createdAt || null);
  const businessDay = fvToBusinessDay(businessDate);

  await saleRef.set({ ...patch, businessDate, businessDay }, { merge: true });
  return patch;
}

async function fvRecomputeIncomingVat(companyId: string, ref: admin.firestore.DocumentReference, data: any) {
  const settings = await fvLoadTaxSettings(companyId);
  const currency = (data.currency || settings.currency) as Currency;

  const totalCostMinor =
    Number(data.totalCostMinor ?? 0) ||
    toMinor(Number(data.totalCost ?? 0), currency);

  let vatCode = data.vatCode as string | undefined;
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
    if (!q.empty) vatCode = (q.docs[0].data() as any).vatCode;
  }
  vatCode = vatCode || settings.defaultVatCode;

  const vatRate = fvResolveVatRate(settings, vatCode);
  const amounts = fvComputeVatAmountsFromNet(totalCostMinor, vatRate, settings.roundingMode);

  const businessDate = fvToBusinessDate(data.date || data.incomeDate || data.recordedAt || data.createdAt || null);
  const businessDay = fvToBusinessDay(businessDate);

  await ref.set(
    {
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
    },
    { merge: true }
  );

  return {
    vatCode,
    vatRate,
    ...amounts,
    currency,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) Country Pack setup
// ─────────────────────────────────────────────────────────────────────────────

export const ensureTaxSettingsExists = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'developer');
  const companyId = fvGetCompanyId(context, data);
  const country = (data?.country || 'AE') as 'AE' | 'SA' | 'JO' | 'EG';

  const ref = firestore.doc(`companies/${companyId}/settings/tax`);
  const snap = await ref.get();

  if (snap.exists && !data?.force) {
    return { success: true, created: false, settings: snap.data() };
  }

  const defaults = fvDefaultTaxSettings(country, data?.overrides || {});
  await ref.set(
    {
      companyId,
      ...defaults,
      updatedAt: FvFieldValue.serverTimestamp(),
      updatedBy: auth.uid,
      createdAt: snap.exists ? snap.data()?.createdAt ?? FvFieldValue.serverTimestamp() : FvFieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // Also backfill company baseCurrency if missing
  const companyRef = firestore.doc(`companies/${companyId}`);
  const companySnap = await companyRef.get();
  const company = companySnap.data() as any;
  if (company && !company.baseCurrency) {
    await companyRef.set({ baseCurrency: defaults.currency, updatedAt: FvFieldValue.serverTimestamp() }, { merge: true });
  }

  await fvWriteAuditLog(companyId, 'SETTINGS', 'tax', 'UPDATE', auth.uid, snap.data(), defaults);
  return { success: true, created: !snap.exists, settings: defaults };
});

// ─────────────────────────────────────────────────────────────────────────────
// 2) Business date stampers (existing collections)
// ─────────────────────────────────────────────────────────────────────────────

export const ensureBusinessFieldsOnExpenseCreate = functions.firestore
  .document('companies/{companyId}/dailyExpenses/{expenseId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt', 'recordedAt']);
  });

export const ensureBusinessFieldsOnIncomingCreate = functions.firestore
  .document('companies/{companyId}/incomingProducts/{incomingId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'incomeDate', 'createdAt', 'recordedAt']);
  });

export const ensureBusinessFieldsOnSaleCreate = functions.firestore
  .document('companies/{companyId}/sales/{saleId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt', 'recordedAt']);
  });

export const ensureBusinessFieldsOnAgriConsumptionCreate = functions.firestore
  .document('companies/{companyId}/agriConsumptions/{consumptionId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt']);
  });

export const ensureBusinessFieldsOnAgriBatchCreate = functions.firestore
  .document('companies/{companyId}/agriBatches/{batchId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['harvestDate', 'createdAt']);
  });

export const ensureBusinessFieldsOnSettlementCreate = functions.firestore
  .document('companies/{companyId}/settlements/{settlementId}')
  .onCreate(async (snap) => {
    await fvStampBusinessFieldsIfMissing(snap.ref, snap.data(), ['date', 'createdAt']);
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3) VAT recompute triggers
// ─────────────────────────────────────────────────────────────────────────────

export const recomputeSaleTaxAndTotals = functions.firestore
  .document('companies/{companyId}/sales/{saleId}')
  .onWrite(async (change, context) => {
    const after = change.after.data();
    if (!after) return;
    const companyId = context.params.companyId as string;

    // Prevent obvious infinite loops by checking if the fields that matter changed.
    const before = change.before.data() || {};
    const watchedChanged =
      before.quantity !== after.quantity ||
      before.salePrice !== after.salePrice ||
      before.salePriceCurrency !== after.salePriceCurrency ||
      before.productId !== after.productId ||
      before.discount !== after.discount ||
      JSON.stringify(before.fx || null) !== JSON.stringify(after.fx || null);

    // Still recompute on create if missing totals/vat
    const missingComputed = !after.vat || !after.totals || typeof after.businessDay !== 'number';
    if (!watchedChanged && !missingComputed) return;

    try {
      await fvRecomputeSaleVatAndTotals(companyId, change.after.ref, after);
    } catch (e) {
      console.error('[recomputeSaleTaxAndTotals] failed', e);
    }
  });

export const recomputeIncomingVatAndTotals = functions.firestore
  .document('companies/{companyId}/incomingProducts/{incomingId}')
  .onWrite(async (change, context) => {
    const after = change.after.data();
    if (!after) return;
    const before = change.before.data() || {};
    const companyId = context.params.companyId as string;

    const watchedChanged =
      before.totalCost !== after.totalCost ||
      before.totalCostMinor !== after.totalCostMinor ||
      before.currency !== after.currency ||
      before.productCode !== after.productCode ||
      before.productId !== after.productId ||
      before.vatCode !== after.vatCode;

    const missingComputed = !after.vat || typeof after.businessDay !== 'number';
    if (!watchedChanged && !missingComputed) return;

    try {
      await fvRecomputeIncomingVat(companyId, change.after.ref, after);
    } catch (e) {
      console.error('[recomputeIncomingVatAndTotals] failed', e);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4) Issue invoice for an existing sale
// ─────────────────────────────────────────────────────────────────────────────

export const issueInvoiceForSale = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
  const companyId = fvGetCompanyId(context, data);
  const saleId = data?.saleId as string;

  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
  }

  const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
  const companyRef = firestore.doc(`companies/${companyId}`);
  const taxRef = firestore.doc(`companies/${companyId}/settings/tax`);

  const result = await firestore.runTransaction(async (tx) => {
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

    const sale = saleSnap.data() as any;
    const company = (companySnap.data() || {}) as any;
    const tax = taxSnap.data() as FvTaxSettings;

    if (sale.invoice?.invoiceId) {
      return {
        invoiceId: sale.invoice.invoiceId,
        invoiceNumber: sale.invoice.invoiceNumber,
        reused: true,
      };
    }

    // Make sure sale has VAT/totals snapshot
    // (Transaction can't call external writes, so we compute inline here)
    const qty = Number(sale.quantity ?? 0);
    const saleCurrency = (sale.salePriceCurrency || tax.currency) as Currency;
    const unitPriceMinor = toMinor(Number(sale.salePrice ?? 0), saleCurrency);
    const discountMinor = toMinor(Number(sale.discount ?? 0), saleCurrency);
    const vatCode = sale.vatCode || tax.defaultVatCode;
    const vatRate = fvResolveVatRate(tax, vatCode);
    const netMinor = Math.max(0, qty * unitPriceMinor - discountMinor);
    const vatMinor = fvRoundMinor(netMinor * vatRate, tax.roundingMode);
    const grossMinor = netMinor + vatMinor;
    const paidTotal = Number(sale.totals?.paidTotal ?? sale.paidMinor ?? 0);
    const dueTotal = Math.max(0, grossMinor - paidTotal);

    const nextNumber = Number(tax.invoiceProfile?.nextNumber ?? 1);
    const prefix = tax.invoiceProfile?.prefix || 'INV';
    const padding = Number(tax.invoiceProfile?.padding ?? 6);
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
        legalName: tax.seller?.legalName || company.name || '',
        taxId: tax.seller?.taxId || company.taxId || null,
        address: tax.seller?.address || company.address || null,
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

    tx.set(
      saleRef,
      {
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
      },
      { merge: true }
    );

    return { invoiceId: invoiceRef.id, invoiceNumber, reused: false };
  });

  await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, {
    action: 'ISSUE_INVOICE',
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
  });

  return { success: true, ...result };
});

// ─────────────────────────────────────────────────────────────────────────────
// 5) "generateInvoicePdf" without extra dependency (stores printable HTML)
//    This avoids adding a PDF library right now. Frontend can open/print HTML.
// ─────────────────────────────────────────────────────────────────────────────

function fvInvoiceHtml(invoice: any) {
  const lines = (invoice.lineItems || [])
    .map((l: any) => `
      <tr>
        <td>${String(l.name || '')}</td>
        <td style="text-align:right">${l.qty ?? 0}</td>
        <td style="text-align:right">${l.unitPriceMinor ?? 0}</td>
        <td style="text-align:right">${l.netMinor ?? 0}</td>
        <td style="text-align:right">${l.vatMinor ?? 0}</td>
        <td style="text-align:right">${l.grossMinor ?? 0}</td>
      </tr>
    `)
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
    <div><b>Seller:</b> ${invoice.sellerSnapshot?.legalName || ''}</div>
    <div><b>Buyer:</b> ${invoice.buyerSnapshot?.name || ''}</div>
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
    <tr><td><b>Net</b></td><td style="text-align:right">${invoice.totals?.netTotal ?? 0}</td></tr>
    <tr><td><b>VAT</b></td><td style="text-align:right">${invoice.totals?.vatTotal ?? 0}</td></tr>
    <tr><td><b>Gross</b></td><td style="text-align:right">${invoice.totals?.grossTotal ?? 0}</td></tr>
  </table>
  <p style="margin-top:18px;color:#666">Stored by FlowVia Cloud Functions (printable HTML version).</p>
</body>
</html>`;
}

export const generateInvoicePdf = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
  const companyId = fvGetCompanyId(context, data);
  const invoiceId = data?.invoiceId as string;
  if (!invoiceId) {
    throw new functions.https.HttpsError('invalid-argument', 'invoiceId is required');
  }

  const invoiceRef = firestore.doc(`companies/${companyId}/invoices/${invoiceId}`);
  const snap = await invoiceRef.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invoice not found');
  }
  const invoice = snap.data() as any;

  const html = fvInvoiceHtml(invoice);
  const bucket = admin.storage().bucket();
  const path = `companies/${companyId}/invoices/${invoiceId}.html`; // printable now; convert to PDF later
  await bucket.file(path).save(html, { contentType: 'text/html; charset=utf-8' });

  await invoiceRef.set(
    {
      printable: { storagePath: path, generatedAt: FvFieldValue.serverTimestamp(), format: 'html' },
      updatedAt: FvFieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await fvWriteAuditLog(companyId, 'INVOICE', invoiceId, 'UPDATE', auth.uid, undefined, {
    action: 'GENERATE_PRINTABLE',
    storagePath: path,
  });

  return { success: true, storagePath: path, format: 'html' };
});

// ─────────────────────────────────────────────────────────────────────────────
// 6) VAT return generator (uses sales + incomingProducts)
// ─────────────────────────────────────────────────────────────────────────────

export const generateVatReturn = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'developer');
  const companyId = fvGetCompanyId(context, data);
  const period = data?.period as string;
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

  const outputByCode: Record<string, { netMinor: number; vatMinor: number }> = {};
  let outputVatMinor = 0;

  for (const doc of salesSnap.docs) {
    const s = doc.data() as any;
    if (s.status === 'CANCELLED') continue;

    const vatCode = s.vat?.code || s.vatCode || tax.defaultVatCode;
    const netMinor = Number(s.vat?.netMinor ?? s.totals?.netTotal ?? 0);
    const vatMinor = Number(s.vat?.vatMinor ?? s.totals?.vatTotal ?? 0);

    if (!outputByCode[vatCode]) outputByCode[vatCode] = { netMinor: 0, vatMinor: 0 };
    outputByCode[vatCode].netMinor += netMinor;
    outputByCode[vatCode].vatMinor += vatMinor;
    outputVatMinor += vatMinor;
  }

  const inputByCode: Record<string, { netMinor: number; vatMinor: number }> = {};
  let inputVatMinor = 0;

  for (const doc of incomingSnap.docs) {
    const p = doc.data() as any;
    const vatCode = p.vat?.code || p.vatCode || tax.defaultVatCode;
    const netMinor = Number(p.vat?.netTotalMinor ?? p.totalCostMinor ?? 0);
    const vatMinor = Number(p.vat?.vatTotalMinor ?? 0);

    if (!inputByCode[vatCode]) inputByCode[vatCode] = { netMinor: 0, vatMinor: 0 };
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

  return { success: true, ...payload, generatedAt: undefined, generatedBy: auth.uid };
});

// ─────────────────────────────────────────────────────────────────────────────
// 7) Basic sales adjustment (simple, audited correction path)
// ─────────────────────────────────────────────────────────────────────────────

export const createSalesAdjustment = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'developer');
  const companyId = fvGetCompanyId(context, data);

  const saleId = data?.saleId as string;
  const grossAdjustmentMinor = Number(data?.grossAdjustmentMinor ?? 0); // negative for credit, positive for debit
  const reason = String(data?.reason || '').trim();

  if (!saleId || !Number.isFinite(grossAdjustmentMinor) || grossAdjustmentMinor === 0 || !reason) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'saleId, grossAdjustmentMinor (non-zero), and reason are required'
    );
  }

  const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
  const tax = await fvLoadTaxSettings(companyId);

  const result = await firestore.runTransaction(async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new functions.https.HttpsError('not-found', 'Sale not found');

    const sale = saleSnap.data() as any;
    if (!sale.invoice?.invoiceId) {
      throw new functions.https.HttpsError('failed-precondition', 'Issue invoice first before adjustment');
    }

    const currentGross = Number(sale.totals?.grossTotal ?? sale.vat?.grossMinor ?? 0);
    const currentVat = Number(sale.totals?.vatTotal ?? sale.vat?.vatMinor ?? 0);
    const currentNet = Number(sale.totals?.netTotal ?? sale.vat?.netMinor ?? 0);
    const paidTotal = Number(sale.totals?.paidTotal ?? 0);

    const vatRate = Number(sale.vat?.rate ?? fvResolveVatRate(tax, sale.vat?.code || sale.vatCode));
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
      currency: sale.vat?.currency || sale.salePriceCurrency || tax.currency,
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

  await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, {
    action: 'ADJUST',
    ...result,
    reason,
  });

  return { success: true, ...result };
});

// ─────────────────────────────────────────────────────────────────────────────
// 8) Agri / Palm pack callables
// ─────────────────────────────────────────────────────────────────────────────

export const createHarvestBatch = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'manager', 'accounting', 'developer');
  const companyId = fvGetCompanyId(context, data);

  const {
    seasonId,
    fieldId,
    harvestDate,
    qty,
    unit = 'kg',
    grade = 'A',
    crop = 'DATES',
    storageLocation = null,
  } = data || {};

  if (!seasonId || !fieldId || !Number.isFinite(Number(qty)) || Number(qty) <= 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'seasonId, fieldId, and positive qty are required'
    );
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

export const recordAgriConsumption = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'manager', 'accounting', 'developer');
  const companyId = fvGetCompanyId(context, data);

  const { seasonId, fieldId, date, lines, decrementInventory = false } = data || {};
  if (!seasonId || !fieldId || !Array.isArray(lines) || lines.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'seasonId, fieldId, and lines[] are required'
    );
  }

  const businessDate = fvToBusinessDate(date || null);
  const businessDay = fvToBusinessDay(businessDate);
  const companySnap = await firestore.doc(`companies/${companyId}`).get();
  const companyBaseCurrency = ((companySnap.data() as any)?.baseCurrency || 'USD') as Currency;

  const preparedLines: any[] = [];
  let totalCostMinor = 0;

  await firestore.runTransaction(async (tx) => {
    for (const line of lines) {
      const productId = String(line.productId || '');
      const qty = Number(line.qty ?? 0);
      if (!productId || !Number.isFinite(qty) || qty <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Each line needs productId and positive qty');
      }

      const productRef = firestore.doc(`companies/${companyId}/products/${productId}`);
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) {
        throw new functions.https.HttpsError('not-found', `Product not found: ${productId}`);
      }
      const p = productSnap.data() as any;

      const unit = p.unit || line.unit || 'unit';
      const costPerUnitBaseMinor =
        Number(p.costBaseMinor ?? 0) ||
        (p.purchasePriceCurrency && p.costMinor && companyBaseCurrency && p.costFx?.rateToBase
          ? convertMinorToBase(Number(p.costMinor), Number(p.costFx.rateToBase), p.purchasePriceCurrency, companyBaseCurrency)
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
        const currentQty = Number(p.quantity ?? 0);
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
    tx.set(
      seasonRef,
      {
        updatedAt: FvFieldValue.serverTimestamp(),
        totalCostMinor: FvFieldValue.increment(totalCostMinor),
      },
      { merge: true }
    );
  });

  await fvWriteAuditLog(companyId, 'AGRI_CONSUMPTION', `${seasonId}:${businessDate}`, 'CREATE', auth.uid, undefined, {
    seasonId,
    fieldId,
    totalCostMinor,
    linesCount: preparedLines.length,
  });

  return { success: true, totalCostMinor, currency: companyBaseCurrency };
});

export const confirmSettlement = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
  const companyId = fvGetCompanyId(context, data);

  const saleId = data?.saleId as string;
  const deductions = Array.isArray(data?.deductions) ? data.deductions : [];
  const date = data?.date;

  if (!saleId) {
    throw new functions.https.HttpsError('invalid-argument', 'saleId is required');
  }

  const normalizedDeductions = deductions.map((d: any) => ({
    type: String(d.type || 'OTHER'),
    amountMinor: Number(d.amountMinor ?? 0),
    note: d.note ? String(d.note) : null,
  }));

  if (normalizedDeductions.some((d: any) => !Number.isFinite(d.amountMinor) || d.amountMinor < 0)) {
    throw new functions.https.HttpsError('invalid-argument', 'All deduction amounts must be >= 0');
  }

  const dedTotal = normalizedDeductions.reduce((sum: number, d: any) => sum + d.amountMinor, 0);

  const saleRef = firestore.doc(`companies/${companyId}/sales/${saleId}`);
  const businessDate = fvToBusinessDate(date || null);
  const businessDay = fvToBusinessDay(businessDate);

  const result = await firestore.runTransaction(async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new functions.https.HttpsError('not-found', 'Sale not found');

    const sale = saleSnap.data() as any;
    const grossAmount =
      Number(sale.totals?.grossTotal ?? sale.vat?.grossMinor ?? sale.revenueMinor ?? 0);
    const paidTotal = Number(sale.totals?.paidTotal ?? 0);

    const netPayable = Math.max(0, grossAmount - dedTotal);
    const dueTotal = Math.max(0, netPayable - paidTotal);

    const settlementRef = firestore.collection(`companies/${companyId}/settlements`).doc();
    tx.set(settlementRef, {
      companyId,
      saleId,
      clientId: sale.clientId || null,
      seasonId: sale.seasonId || sale.agri?.seasonId || null,
      fieldId: sale.fieldId || sale.agri?.fieldId || null,
      batchId: sale.batchId || sale.agri?.batchId || null,
      currency: sale.vat?.currency || sale.salePriceCurrency || 'USD',
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

    tx.set(
      saleRef,
      {
        settlement: {
          settlementId: settlementRef.id,
          deductionsTotalMinor: dedTotal,
          netPayableMinor: netPayable,
          confirmedAt: FvFieldValue.serverTimestamp(),
        },
        'totals.dueTotal': dueTotal,
        updatedAt: FvFieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Optional client ledger adjustment entry (keeps debt sheet accurate)
    if (sale.clientId && dedTotal > 0) {
      const clientLedgerRef = firestore.collection(`companies/${companyId}/clients/${sale.clientId}/ledger`).doc();
      tx.set(clientLedgerRef, {
        companyId,
        clientId: sale.clientId,
        type: 'adjustment',
        currency: sale.vat?.currency || sale.salePriceCurrency || 'USD',
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

  await fvWriteAuditLog(companyId, 'SALE', saleId, 'UPDATE', auth.uid, undefined, {
    action: 'CONFIRM_SETTLEMENT',
    ...result,
  });

  return { success: true, ...result };
});

// ─────────────────────────────────────────────────────────────────────────────
// 9) Agri season P&L export (JSON snapshot)
// ─────────────────────────────────────────────────────────────────────────────

export const exportSeasonPnl = functions.https.onCall(async (data, context) => {
  const auth = fvRequireRole(context, 'admin', 'accounting', 'manager', 'developer');
  const companyId = fvGetCompanyId(context, data);
  const seasonId = data?.seasonId as string;

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
  const costsByField: Record<string, number> = {};
  for (const doc of consumptionsSnap.docs) {
    const d = doc.data() as any;
    const c = Number(d.totalCost ?? 0);
    totalConsumptionCostMinor += c;
    const fieldId = d.fieldId || 'unknown';
    costsByField[fieldId] = (costsByField[fieldId] || 0) + c;
  }

  let grossRevenueMinor = 0;
  let vatRevenueMinor = 0;
  let netRevenueMinor = 0;
  let totalQtySold = 0;
  const revenueByBuyer: Record<string, number> = {};
  const revenueByGrade: Record<string, number> = {};

  for (const doc of salesSnap.docs) {
    const s = doc.data() as any;
    if (s.status === 'CANCELLED') continue;

    const saleSeasonId =
      s.seasonId ||
      s.agri?.seasonId ||
      (Array.isArray(s.lines) ? s.lines.find((l: any) => l.seasonId)?.seasonId : null);

    if (saleSeasonId !== seasonId) continue;

    const gross = Number(s.totals?.grossTotal ?? s.vat?.grossMinor ?? s.revenueMinor ?? 0);
    const vat = Number(s.totals?.vatTotal ?? s.vat?.vatMinor ?? 0);
    const net = Number(s.totals?.netTotal ?? Math.max(0, gross - vat));

    grossRevenueMinor += gross;
    vatRevenueMinor += vat;
    netRevenueMinor += net;

    const qty = Number(s.quantity ?? 0);
    totalQtySold += qty;

    const buyer = s.clientName || 'Unknown Buyer';
    revenueByBuyer[buyer] = (revenueByBuyer[buyer] || 0) + gross;

    const grade = s.grade || s.agri?.grade || 'N/A';
    revenueByGrade[grade] = (revenueByGrade[grade] || 0) + gross;
  }

  let settlementDeductionsMinor = 0;
  for (const doc of settlementsSnap.docs) {
    settlementDeductionsMinor += Number((doc.data() as any).deductionsTotalMinor ?? 0);
  }

  const effectiveRevenueMinor = Math.max(0, grossRevenueMinor - settlementDeductionsMinor);
  const grossProfitMinor = effectiveRevenueMinor - totalConsumptionCostMinor;
  const costPerKgMinor = totalQtySold > 0 ? fvRoundMinor(totalConsumptionCostMinor / totalQtySold, 'HALF_UP') : 0;

  const report = {
    companyId,
    seasonId,
    seasonName: (seasonSnap.data() as any)?.name || seasonId,
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

export const onAgriConsumptionWriteRecomputeSeasonTotal = functions.firestore
  .document('companies/{companyId}/agriConsumptions/{consumptionId}')
  .onWrite(async (change, context) => {
    const companyId = context.params.companyId as string;
    const before = change.before.data() as any | undefined;
    const after = change.after.data() as any | undefined;

    const beforeSeasonId = before?.seasonId;
    const afterSeasonId = after?.seasonId;

    // If deleted or season moved, simplest safe path is to do nothing here.
    // (You can add a full season total recompute callable later.)
    if (!after || !afterSeasonId) return;

    const beforeTotal = Number(before?.totalCost ?? 0);
    const afterTotal = Number(after?.totalCost ?? 0);
    const delta = afterTotal - beforeTotal;
    if (!delta) return;

    try {
      await firestore.doc(`companies/${companyId}/agriSeasons/${afterSeasonId}`).set(
        {
          totalCostMinor: FvFieldValue.increment(delta),
          updatedAt: FvFieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      console.error('[onAgriConsumptionWriteRecomputeSeasonTotal] failed', e);
    }
  });
