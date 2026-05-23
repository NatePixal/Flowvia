import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Currency, UserRole } from './types';
import { CURRENCY_DECIMALS } from './currency-config';
import {
  parseBoolean,
  parseDateRange,
  parseNumber,
  parseString,
  resolveCompanyAccess,
} from './security';

if (!admin.apps.length) {
  admin.initializeApp();
}

let _db: admin.firestore.Firestore | null = null;
const firestore = new Proxy({} as admin.firestore.Firestore, {
  get(target, prop) {
    if (!_db) {
      _db = admin.firestore();
    }
    const value = (_db as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_db);
    }
    return value;
  }
});
const FieldValue = admin.firestore.FieldValue;

type RoundingMode = 'HALF_UP' | 'BANKERS' | 'DOWN';
type TaxSettings = {
  country?: string;
  currency?: Currency;
  vatEnabled?: boolean;
  defaultVatCode?: string;
  roundingMode?: RoundingMode;
  vatRates?: Array<{ code: string; rate: number | null; label?: string }>;
};

type AuditAnomaly = {
  severity: 'warning' | 'error';
  collection: string;
  documentId: string;
  code: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
};

type ComputedSale = {
  currency: Currency;
  baseCurrency: Currency;
  quantity: number;
  subtotalMinor: number;
  discountMinor: number;
  netMinor: number;
  vatCode: string;
  vatRate: number;
  vatMinor: number;
  grossMinor: number;
  paidMinor: number;
  dueMinor: number;
  costOfGoodsSoldMinor: number;
  grossProfitMinor: number;
  revenueBaseMinor: number | null;
  costOfGoodsSoldBaseMinor: number | null;
  grossProfitBaseMinor: number | null;
  warnings: string[];
};

const FINANCE_ROLES: UserRole[] = ['admin', 'accounting', 'developer'];
const VIEW_ROLES: UserRole[] = ['admin', 'accounting', 'manager', 'sales', 'developer'];
const MIGRATION_VERSION = 'minor-units-v1';

function decimalsFor(currency: Currency): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

export function assertSafeIntegerMoney(value: number, fieldName = 'money'): void {
  if (!Number.isSafeInteger(value)) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a safe integer minor-unit value.`);
  }
}

export function safeRoundMinor(value: number, mode: RoundingMode = 'HALF_UP'): number {
  if (!Number.isFinite(value)) return 0;
  if (mode === 'DOWN') return Math.floor(value);
  if (mode === 'BANKERS') {
    const floor = Math.floor(value);
    const fraction = value - floor;
    if (Math.abs(fraction - 0.5) < Number.EPSILON) return floor % 2 === 0 ? floor : floor + 1;
    return Math.round(value);
  }
  return Math.round(value);
}

export function toMinorStrict(amount: unknown, currency: Currency, fieldName = 'amount'): number {
  const numberValue = Number(amount);
  if (!Number.isFinite(numberValue)) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a finite number.`);
  }
  const minor = safeRoundMinor(numberValue * Math.pow(10, decimalsFor(currency)));
  assertSafeIntegerMoney(minor, fieldName);
  return minor;
}

export function fromMinorStrict(minor: number, currency: Currency): number {
  assertSafeIntegerMoney(minor);
  return minor / Math.pow(10, decimalsFor(currency));
}

function rateToBasisPoints(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new functions.https.HttpsError('invalid-argument', 'VAT rate must be between 0 and 1.');
  }
  return safeRoundMinor(rate * 10000);
}

export function computeVatFromNet(netMinor: number, rate: number, roundingMode: RoundingMode = 'HALF_UP'): number {
  assertSafeIntegerMoney(netMinor, 'netMinor');
  const bps = rateToBasisPoints(rate);
  return safeRoundMinor((netMinor * bps) / 10000, roundingMode);
}

export function computeVatFromGross(grossMinor: number, rate: number, roundingMode: RoundingMode = 'HALF_UP'): number {
  assertSafeIntegerMoney(grossMinor, 'grossMinor');
  const bps = rateToBasisPoints(rate);
  return safeRoundMinor((grossMinor * bps) / (10000 + bps), roundingMode);
}

function convertMinorToBaseStrict(amountMinor: number, rateToBase: number, sourceCurrency: Currency, baseCurrency: Currency): number {
  if (sourceCurrency === baseCurrency) return amountMinor;
  const rate = Number(rateToBase);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new functions.https.HttpsError('failed-precondition', `FX snapshot is required for ${sourceCurrency} to ${baseCurrency}.`);
  }
  return toMinorStrict(fromMinorStrict(amountMinor, sourceCurrency) * rate, baseCurrency, 'baseAmount');
}

function convertBaseToMinorStrict(baseMinor: number, rateToBase: number, targetCurrency: Currency, baseCurrency: Currency): number {
  if (targetCurrency === baseCurrency) return baseMinor;
  const rate = Number(rateToBase);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return toMinorStrict(fromMinorStrict(baseMinor, baseCurrency) / rate, targetCurrency, 'convertedAmount');
}

export async function writeAuditLog(
  companyId: string,
  actorUid: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  severity: 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
  await firestore.collection(`companies/${companyId}/auditLogs`).add({
    companyId,
    actorUid,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    severity,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getTaxSettings(companyId: string): Promise<TaxSettings> {
  const snap = await firestore.doc(`companies/${companyId}/settings/tax`).get();
  if (!snap.exists) {
    return {
      currency: await getCompanyBaseCurrency(companyId),
      vatEnabled: false,
      defaultVatCode: 'STD',
      roundingMode: 'HALF_UP',
      vatRates: [{ code: 'STD', rate: 0 }],
    };
  }
  return snap.data() as TaxSettings;
}

export async function getCompanyBaseCurrency(companyId: string): Promise<Currency> {
  const snap = await firestore.doc(`companies/${companyId}`).get();
  const currency = snap.data()?.baseCurrency || snap.data()?.currency || 'USD';
  return String(currency).toUpperCase() as Currency;
}

export function normalizeBusinessDate(value: unknown): { businessDate: string; businessDay: number } {
  let date: Date | null = null;
  if (value instanceof admin.firestore.Timestamp) date = value.toDate();
  if (!date && value instanceof Date) date = value;
  if (!date && (typeof value === 'string' || typeof value === 'number')) date = new Date(value);
  if (!date || !Number.isFinite(date.getTime())) date = new Date();
  const businessDate = date.toISOString().slice(0, 10);
  return { businessDate, businessDay: Number(businessDate.replace(/-/g, '')) };
}

function resolveVatRate(settings: TaxSettings, vatCode?: string, snapshotRate?: number): { vatCode: string; vatRate: number } {
  if (typeof snapshotRate === 'number' && Number.isFinite(snapshotRate) && snapshotRate >= 0) {
    return { vatCode: vatCode || settings.defaultVatCode || 'STD', vatRate: snapshotRate };
  }
  if (settings.vatEnabled === false) {
    return { vatCode: vatCode || settings.defaultVatCode || 'STD', vatRate: 0 };
  }
  const code = vatCode || settings.defaultVatCode || 'STD';
  const row = (settings.vatRates || []).find((rate) => rate.code === code);
  return { vatCode: code, vatRate: row?.rate ?? 0 };
}

function docBusinessDay(data: FirebaseFirestore.DocumentData): number | null {
  if (typeof data.businessDay === 'number') return data.businessDay;
  if (typeof data.businessDay === 'string') {
    const numeric = Number(data.businessDay.replace(/-/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }
  const normalized = normalizeBusinessDate(data.businessDate || data.date || data.createdAt || data.incomeDate);
  return normalized.businessDay;
}

function inRequestedRange(data: FirebaseFirestore.DocumentData, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true;
  const businessDay = docBusinessDay(data);
  if (!businessDay) return false;
  const fromDay = from ? Number(from.toISOString().slice(0, 10).replace(/-/g, '')) : null;
  const toDay = to ? Number(to.toISOString().slice(0, 10).replace(/-/g, '')) : null;
  return (fromDay === null || businessDay >= fromDay) && (toDay === null || businessDay <= toDay);
}

function getMinorFromDocument(data: FirebaseFirestore.DocumentData, minorFields: string[], majorField: string, currency: Currency): number {
  for (const field of minorFields) {
    const value = data[field];
    if (Number.isSafeInteger(value)) return value;
  }
  if (data[majorField] !== undefined && data[majorField] !== null) {
    return toMinorStrict(data[majorField], currency, majorField);
  }
  return 0;
}

function computeCogs(
  sale: FirebaseFirestore.DocumentData,
  product: FirebaseFirestore.DocumentData | null,
  saleCurrency: Currency,
  baseCurrency: Currency,
  quantity: number
): { cogsMinor: number; cogsBaseMinor: number | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!product) {
    warnings.push('sale_product_missing');
    return { cogsMinor: 0, cogsBaseMinor: null, warnings };
  }

  const productCurrency = String(product.purchasePriceCurrency || product.currency || saleCurrency).toUpperCase() as Currency;
  const unitCostMinor =
    Number.isSafeInteger(product.costMinor) ? Number(product.costMinor) :
    Number.isSafeInteger(product.purchasePriceMinor) ? Number(product.purchasePriceMinor) :
    product.cost !== undefined ? toMinorStrict(product.cost, productCurrency, 'product.cost') :
    product.purchasePrice !== undefined ? toMinorStrict(product.purchasePrice, productCurrency, 'product.purchasePrice') :
    0;

  let cogsBaseMinor: number | null = null;
  if (Number.isSafeInteger(product.costBaseMinor)) {
    cogsBaseMinor = safeRoundMinor(Number(product.costBaseMinor) * quantity);
  } else if (productCurrency === baseCurrency) {
    cogsBaseMinor = safeRoundMinor(unitCostMinor * quantity);
  } else if (product.costFx?.rateToBase) {
    cogsBaseMinor = convertMinorToBaseStrict(safeRoundMinor(unitCostMinor * quantity), Number(product.costFx.rateToBase), productCurrency, baseCurrency);
  } else {
    warnings.push('product_cost_missing_base_fx');
  }

  let cogsMinor = 0;
  if (productCurrency === saleCurrency) {
    cogsMinor = safeRoundMinor(unitCostMinor * quantity);
  } else if (saleCurrency === baseCurrency && cogsBaseMinor !== null) {
    cogsMinor = cogsBaseMinor;
  } else if (cogsBaseMinor !== null && sale.fx?.rateToBase) {
    cogsMinor = convertBaseToMinorStrict(cogsBaseMinor, Number(sale.fx.rateToBase), saleCurrency, baseCurrency);
  } else {
    warnings.push('sale_cost_missing_fx');
  }

  return { cogsMinor, cogsBaseMinor, warnings };
}

function computeSale(
  sale: FirebaseFirestore.DocumentData,
  product: FirebaseFirestore.DocumentData | null,
  tax: TaxSettings,
  baseCurrency: Currency,
  forceCurrentVat: boolean
): ComputedSale {
  const currency = String(sale.salePriceCurrency || sale.currency || tax.currency || baseCurrency).toUpperCase() as Currency;
  const quantity = Number(sale.quantity ?? 0);
  const unitPriceMinor = getMinorFromDocument(sale, ['unitPriceMinor', 'salePriceMinor'], 'salePrice', currency);
  const discountMinor = getMinorFromDocument(sale, ['discountMinor'], 'discount', currency);
  const subtotalMinor = safeRoundMinor(unitPriceMinor * quantity);
  const netMinor = Math.max(0, subtotalMinor - discountMinor);
  const snapshotRate = forceCurrentVat ? undefined : sale.vat?.rate;
  const { vatCode, vatRate } = resolveVatRate(tax, sale.vat?.code || sale.vatCode, snapshotRate);
  const vatMinor = computeVatFromNet(netMinor, vatRate, tax.roundingMode || 'HALF_UP');
  const grossMinor = netMinor + vatMinor;
  const paidMinor = Math.max(0, Number(sale.totals?.paidTotal ?? sale.paidMinor ?? sale.paidAmountMinor ?? 0));
  const dueMinor = Math.max(0, grossMinor - paidMinor);
  const cogs = computeCogs(sale, product, currency, baseCurrency, quantity);

  let revenueBaseMinor: number | null = null;
  if (currency === baseCurrency) {
    revenueBaseMinor = grossMinor;
  } else if (sale.fx?.rateToBase) {
    revenueBaseMinor = convertMinorToBaseStrict(grossMinor, Number(sale.fx.rateToBase), currency, baseCurrency);
  }

  const costBase = cogs.cogsBaseMinor;
  const grossProfitMinor = grossMinor - cogs.cogsMinor;
  const grossProfitBaseMinor = revenueBaseMinor !== null && costBase !== null ? revenueBaseMinor - costBase : null;

  return {
    currency,
    baseCurrency,
    quantity,
    subtotalMinor,
    discountMinor,
    netMinor,
    vatCode,
    vatRate,
    vatMinor,
    grossMinor,
    paidMinor,
    dueMinor,
    costOfGoodsSoldMinor: cogs.cogsMinor,
    grossProfitMinor,
    revenueBaseMinor,
    costOfGoodsSoldBaseMinor: costBase,
    grossProfitBaseMinor,
    warnings: cogs.warnings,
  };
}

function salePatch(computed: ComputedSale): FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> {
  return {
    baseCurrency: computed.baseCurrency,
    vatCode: computed.vatCode,
    vat: {
      code: computed.vatCode,
      rate: computed.vatRate,
      netMinor: computed.netMinor,
      vatMinor: computed.vatMinor,
      grossMinor: computed.grossMinor,
      currency: computed.currency,
    },
    taxSummary: [{ code: computed.vatCode, rate: computed.vatRate, netMinor: computed.netMinor, vatMinor: computed.vatMinor }],
    totals: {
      netTotal: computed.netMinor,
      vatTotal: computed.vatMinor,
      grossTotal: computed.grossMinor,
      paidTotal: computed.paidMinor,
      dueTotal: computed.dueMinor,
    },
    revenueMinor: computed.grossMinor,
    costOfGoodsSoldMinor: computed.costOfGoodsSoldMinor,
    grossProfitMinor: computed.grossProfitMinor,
    revenueBaseMinor: computed.revenueBaseMinor,
    costOfGoodsSoldBaseMinor: computed.costOfGoodsSoldBaseMinor,
    grossProfitBaseMinor: computed.grossProfitBaseMinor,
    financialsVersion: MIGRATION_VERSION,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function materiallyDifferent(current: FirebaseFirestore.DocumentData, computed: ComputedSale): boolean {
  return (
    current.totals?.netTotal !== computed.netMinor ||
    current.totals?.vatTotal !== computed.vatMinor ||
    current.totals?.grossTotal !== computed.grossMinor ||
    current.totals?.paidTotal !== computed.paidMinor ||
    current.totals?.dueTotal !== computed.dueMinor ||
    current.revenueMinor !== computed.grossMinor ||
    current.costOfGoodsSoldMinor !== computed.costOfGoodsSoldMinor ||
    current.grossProfitMinor !== computed.grossProfitMinor ||
    current.revenueBaseMinor !== computed.revenueBaseMinor ||
    current.costOfGoodsSoldBaseMinor !== computed.costOfGoodsSoldBaseMinor ||
    current.grossProfitBaseMinor !== computed.grossProfitBaseMinor
  );
}

async function loadProduct(companyId: string, sale: FirebaseFirestore.DocumentData): Promise<FirebaseFirestore.DocumentData | null> {
  if (!sale.productId) return null;
  const snap = await firestore.doc(`companies/${companyId}/products/${String(sale.productId)}`).get();
  return snap.exists ? snap.data() || null : null;
}

async function addAnomalyLogs(companyId: string, actorUid: string, anomalies: AuditAnomaly[]): Promise<void> {
  const chunks: AuditAnomaly[][] = [];
  for (let i = 0; i < anomalies.length; i += 450) chunks.push(anomalies.slice(i, i + 450));
  for (const chunk of chunks) {
    const batch = firestore.batch();
    for (const anomaly of chunk) {
      const ref = firestore.collection(`companies/${companyId}/auditLogs`).doc();
      batch.set(ref, {
        companyId,
        actorUid,
        action: 'FINANCIAL_AUDIT_ANOMALY',
        entityType: anomaly.collection,
        entityId: anomaly.documentId,
        severity: anomaly.severity,
        code: anomaly.code,
        message: anomaly.message,
        expected: anomaly.expected ?? null,
        actual: anomaly.actual ?? null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export const auditFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const { from, to } = parseDateRange(data || {});
  const sampleLimit = Math.min(Math.max(Number(data?.sampleLimit ?? 500), 1), 2000);
  const repairMode = data?.repairMode === undefined ? false : parseBoolean(data.repairMode, 'repairMode');
  const tax = await getTaxSettings(companyId);
  const baseCurrency = await getCompanyBaseCurrency(companyId);
  const anomalies: AuditAnomaly[] = [];
  const warnings: string[] = [];
  let checkedSales = 0;
  let checkedExpenses = 0;
  let checkedProducts = 0;
  let checkedClients = 0;

  const [salesSnap, expensesSnap, incomingSnap, clientsSnap, suppliersSnap, productsSnap] = await Promise.all([
    firestore.collection(`companies/${companyId}/sales`).limit(sampleLimit).get(),
    firestore.collection(`companies/${companyId}/dailyExpenses`).limit(sampleLimit).get(),
    firestore.collection(`companies/${companyId}/incomingProducts`).limit(sampleLimit).get(),
    firestore.collection(`companies/${companyId}/clients`).limit(sampleLimit).get(),
    firestore.collection(`companies/${companyId}/suppliers`).limit(sampleLimit).get(),
    firestore.collection(`companies/${companyId}/products`).limit(sampleLimit).get(),
  ]);

  const productById = new Map(productsSnap.docs.map((doc) => [doc.id, doc.data()]));
  checkedProducts = productsSnap.size;

  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (!inRequestedRange(sale, from, to) || sale.status === 'CANCELLED') continue;
    checkedSales += 1;
    const product = sale.productId ? productById.get(String(sale.productId)) || null : null;
    const computed = computeSale(sale, product, tax, baseCurrency, false);
    const add = (code: string, message: string, expected?: unknown, actual?: unknown, severity: 'warning' | 'error' = 'error') => {
      anomalies.push({ severity, collection: 'sales', documentId: saleDoc.id, code, message, expected, actual });
    };

    if (!Number.isSafeInteger(sale.revenueMinor) && !Number.isSafeInteger(sale.totals?.grossTotal)) add('missing_minor_units', 'Sale is missing integer minor-unit totals.');
    if (computed.quantity <= 0) add('negative_or_zero_quantity', 'Sale quantity must be positive.', '> 0', computed.quantity);
    if (getMinorFromDocument(sale, ['unitPriceMinor', 'salePriceMinor'], 'salePrice', computed.currency) < 0) add('negative_price', 'Sale price cannot be negative.');
    if (computed.paidMinor > computed.grossMinor) add('paid_exceeds_total', 'Paid amount exceeds gross total.', computed.grossMinor, computed.paidMinor);
    if (sale.totals?.dueTotal !== undefined && sale.totals.dueTotal !== computed.dueMinor) add('due_mismatch', 'Sale due total does not match recomputed due.', computed.dueMinor, sale.totals.dueTotal);
    if (sale.totals?.vatTotal !== undefined && sale.totals.vatTotal !== computed.vatMinor) add('vat_mismatch', 'Sale VAT does not match deterministic VAT calculation.', computed.vatMinor, sale.totals.vatTotal);
    if (sale.revenueMinor !== undefined && sale.revenueMinor !== computed.grossMinor) add('revenue_mismatch', 'Sale revenue does not match gross total.', computed.grossMinor, sale.revenueMinor);
    if (computed.currency !== baseCurrency && !sale.fx?.rateToBase) add('missing_fx_snapshot', 'Non-base-currency sale is missing stored FX snapshot.', undefined, computed.currency);
    if (!sale.businessDate || !sale.businessDay) add('missing_business_date', 'Sale is missing businessDate/businessDay.', undefined, { businessDate: sale.businessDate, businessDay: sale.businessDay }, 'warning');
    if (sale.productId && !product) add('missing_product', 'Sale references a missing product.', sale.productId, null);
    for (const warning of computed.warnings) warnings.push(`${saleDoc.id}:${warning}`);
  }

  for (const expenseDoc of expensesSnap.docs) {
    const expense = expenseDoc.data();
    if (!inRequestedRange(expense, from, to)) continue;
    checkedExpenses += 1;
    const currency = String(expense.currency || baseCurrency).toUpperCase() as Currency;
    const amountMinor = Number.isSafeInteger(expense.amountMinor) ? expense.amountMinor : toMinorStrict(expense.amount ?? 0, currency, 'expense.amount');
    if (amountMinor < 0) anomalies.push({ severity: 'error', collection: 'dailyExpenses', documentId: expenseDoc.id, code: 'negative_expense', message: 'Expense amount cannot be negative.', actual: amountMinor });
    if (!Number.isSafeInteger(expense.amountMinor)) anomalies.push({ severity: 'warning', collection: 'dailyExpenses', documentId: expenseDoc.id, code: 'missing_minor_units', message: 'Expense is missing amountMinor.', expected: amountMinor, actual: expense.amountMinor });
    if (currency !== baseCurrency && !expense.fx?.rateToBase && !Number.isSafeInteger(expense.amountBaseMinor)) anomalies.push({ severity: 'error', collection: 'dailyExpenses', documentId: expenseDoc.id, code: 'missing_fx_snapshot', message: 'Non-base-currency expense is missing stored FX snapshot.' });
    if (!expense.businessDate || !expense.businessDay) anomalies.push({ severity: 'warning', collection: 'dailyExpenses', documentId: expenseDoc.id, code: 'missing_business_date', message: 'Expense is missing businessDate/businessDay.' });
  }

  for (const incomingDoc of incomingSnap.docs) {
    const incoming = incomingDoc.data();
    if (!inRequestedRange(incoming, from, to)) continue;
    const currency = String(incoming.currency || baseCurrency).toUpperCase() as Currency;
    const totalCostMinor = Number.isSafeInteger(incoming.totalCostMinor) ? incoming.totalCostMinor : toMinorStrict(incoming.totalCost ?? 0, currency, 'incoming.totalCost');
    if (Number(incoming.quantity ?? 0) <= 0) anomalies.push({ severity: 'error', collection: 'incomingProducts', documentId: incomingDoc.id, code: 'negative_or_zero_quantity', message: 'Incoming product quantity must be positive.' });
    if (totalCostMinor < 0) anomalies.push({ severity: 'error', collection: 'incomingProducts', documentId: incomingDoc.id, code: 'negative_cost', message: 'Incoming product cost cannot be negative.' });
    if (currency !== baseCurrency && !incoming.fx?.rateToBase && !Number.isSafeInteger(incoming.totalCostBaseMinor)) anomalies.push({ severity: 'error', collection: 'incomingProducts', documentId: incomingDoc.id, code: 'missing_fx_snapshot', message: 'Non-base-currency incoming product is missing stored FX snapshot.' });
  }

  for (const clientDoc of clientsSnap.docs) {
    checkedClients += 1;
    const ledgerSnap = await clientDoc.ref.collection('ledger').limit(sampleLimit).get();
    const balances: Record<string, number> = {};
    for (const ledger of ledgerSnap.docs) {
      const entry = ledger.data();
      const currency = String(entry.currency || baseCurrency);
      const due = Number(entry.dueMinor ?? ((entry.totalMinor ?? 0) - (entry.paidMinor ?? 0)));
      balances[currency] = (balances[currency] || 0) + due;
      if (entry.relatedSaleId) {
        const saleSnap = await firestore.doc(`companies/${companyId}/sales/${entry.relatedSaleId}`).get();
        if (saleSnap.exists) {
          const saleDue = Number(saleSnap.data()?.totals?.dueTotal ?? saleSnap.data()?.dueMinor ?? 0);
          if (entry.type === 'purchase' && due !== saleDue) {
            anomalies.push({ severity: 'warning', collection: 'clients/ledger', documentId: ledger.id, code: 'client_ledger_due_mismatch', message: 'Client ledger due does not match related sale due.', expected: saleDue, actual: due });
          }
        }
      }
    }
    const current = clientDoc.data().outstandingByCurrency || {};
    if (JSON.stringify(current) !== JSON.stringify(balances)) {
      anomalies.push({ severity: 'warning', collection: 'clients', documentId: clientDoc.id, code: 'client_balance_mismatch', message: 'Client outstanding balance does not match ledger.', expected: balances, actual: current });
    }
  }

  for (const supplierDoc of suppliersSnap.docs) {
    const ledgerSnap = await supplierDoc.ref.collection('ledger').limit(sampleLimit).get();
    for (const ledger of ledgerSnap.docs) {
      const entry = ledger.data();
      if (Number(entry.purchaseDueMinor ?? entry.dueMinor ?? 0) < 0) {
        anomalies.push({ severity: 'warning', collection: 'suppliers/ledger', documentId: ledger.id, code: 'negative_supplier_due', message: 'Supplier ledger due amount is negative.' });
      }
    }
  }

  await addAnomalyLogs(companyId, access.uid, anomalies);
  if (repairMode) {
    await writeAuditLog(companyId, access.uid, 'FINANCIAL_AUDIT_REPAIR_REQUESTED', 'COMPANY', companyId, null, { anomalyCount: anomalies.length }, 'warning');
  }

  return {
    checkedSales,
    checkedExpenses,
    checkedProducts,
    checkedClients,
    anomalyCount: anomalies.length,
    anomalies: anomalies.slice(0, sampleLimit),
    repairApplied: false,
    warnings,
  };
});

export const migrateProductsToMinorUnits = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const dryRun = data?.dryRun === undefined ? true : parseBoolean(data.dryRun, 'dryRun');
  const force = data?.force === undefined ? false : parseBoolean(data.force, 'force');
  const limit = Math.min(Math.max(Number(data?.limit ?? 500), 1), 2000);
  const errors: Array<{ productId: string; message: string }> = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  const productsSnap = await firestore.collection(`companies/${companyId}/products`).limit(limit).get();
  let batch = firestore.batch();
  let batchCount = 0;

  const commitIfNeeded = async () => {
    if (batchCount === 0 || dryRun) return;
    await batch.commit();
    batch = firestore.batch();
    batchCount = 0;
  };

  for (const doc of productsSnap.docs) {
    processed += 1;
    const product = doc.data();
    try {
      if (product.migrationVersion === MIGRATION_VERSION && product.migratedToMinorUnitsAt && !force) {
        skipped += 1;
        continue;
      }
      const purchaseCurrency = String(product.purchasePriceCurrency || product.currency || 'USD').toUpperCase() as Currency;
      const sellingCurrency = String(product.sellingPriceCurrency || purchaseCurrency).toUpperCase() as Currency;
      const purchasePriceMinor = Number.isSafeInteger(product.purchasePriceMinor) ? product.purchasePriceMinor : toMinorStrict(product.purchasePrice ?? 0, purchaseCurrency, 'purchasePrice');
      const sellingPriceMinor = Number.isSafeInteger(product.sellingPriceMinor) ? product.sellingPriceMinor : toMinorStrict(product.sellingPrice ?? 0, sellingCurrency, 'sellingPrice');
      const costMinor = product.cost !== undefined || product.costMinor !== undefined
        ? Number.isSafeInteger(product.costMinor) ? product.costMinor : toMinorStrict(product.cost ?? product.purchasePrice ?? 0, purchaseCurrency, 'cost')
        : purchasePriceMinor;

      const patch = {
        purchasePriceMinor,
        sellingPriceMinor,
        costMinor,
        historicalPricingSnapshot: {
          purchasePrice: product.purchasePrice ?? null,
          purchasePriceCurrency: product.purchasePriceCurrency ?? null,
          sellingPrice: product.sellingPrice ?? null,
          sellingPriceCurrency: product.sellingPriceCurrency ?? null,
          cost: product.cost ?? null,
          capturedAt: FieldValue.serverTimestamp(),
        },
        migratedToMinorUnitsAt: FieldValue.serverTimestamp(),
        migratedToMinorUnitsBy: access.uid,
        migrationVersion: MIGRATION_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      };

      updated += 1;
      if (!dryRun) {
        batch.set(doc.ref, patch, { merge: true });
        batchCount += 1;
        if (batchCount >= 450) await commitIfNeeded();
      }
    } catch (error) {
      errors.push({ productId: doc.id, message: error instanceof Error ? error.message : 'Unknown migration error.' });
    }
  }

  await commitIfNeeded();
  if (!dryRun && updated > 0) {
    await writeAuditLog(companyId, access.uid, 'MIGRATE_PRODUCTS_TO_MINOR_UNITS', 'PRODUCT', 'batch', null, { processed, updated, skipped, errors }, 'info');
  }

  return { processed, updated, skipped, errors, dryRun };
});

export const recalculateSalesFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const dryRun = data?.dryRun === undefined ? true : parseBoolean(data.dryRun, 'dryRun');
  const force = data?.force === undefined ? false : parseBoolean(data.force, 'force');
  const limit = Math.min(Math.max(Number(data?.limit ?? 500), 1), 1500);
  const { from, to } = parseDateRange(data || {});
  const tax = await getTaxSettings(companyId);
  const baseCurrency = await getCompanyBaseCurrency(companyId);
  let processed = 0;
  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  const errors: Array<{ saleId: string; message: string }> = [];

  const salesSnap = await firestore.collection(`companies/${companyId}/sales`).limit(limit).get();
  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (!inRequestedRange(sale, from, to) || sale.status === 'CANCELLED') continue;
    processed += 1;
    try {
      const product = await loadProduct(companyId, sale);
      const computed = computeSale(sale, product, tax, baseCurrency, force);
      const isChanged = force || materiallyDifferent(sale, computed);
      if (!isChanged) {
        unchanged += 1;
        continue;
      }
      changed += 1;
      if (dryRun) continue;

      await firestore.runTransaction(async (tx) => {
        const freshSale = await tx.get(saleDoc.ref);
        if (!freshSale.exists) throw new functions.https.HttpsError('not-found', 'Sale disappeared during recalculation.');
        const freshProduct = await loadProduct(companyId, freshSale.data() || {});
        const freshComputed = computeSale(freshSale.data() || {}, freshProduct, tax, baseCurrency, force);
        tx.set(saleDoc.ref, salePatch(freshComputed), { merge: true });
        if (freshSale.data()?.clientId) {
          const ledgerQuery = firestore
            .collection(`companies/${companyId}/clients/${freshSale.data()?.clientId}/ledger`)
            .where('relatedSaleId', '==', saleDoc.id)
            .limit(1);
          const ledgerSnap = await tx.get(ledgerQuery);
          if (!ledgerSnap.empty) {
            tx.set(ledgerSnap.docs[0].ref, {
              totalMinor: freshComputed.grossMinor,
              paidMinor: freshComputed.paidMinor,
              dueMinor: freshComputed.dueMinor,
              currency: freshComputed.currency,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }
        }
      });

      await writeAuditLog(companyId, access.uid, 'RECALCULATE_SALE_FINANCIALS', 'SALE', saleDoc.id, {
        totals: sale.totals ?? null,
        revenueMinor: sale.revenueMinor ?? null,
      }, salePatch(computed), 'info');
    } catch (error) {
      failed += 1;
      errors.push({ saleId: saleDoc.id, message: error instanceof Error ? error.message : 'Unknown recalculation error.' });
    }
  }

  return { processed, changed, unchanged, failed, errors, dryRun };
});

function ledgerDelta(entry: FirebaseFirestore.DocumentData): number {
  const type = String(entry.type || '').toLowerCase();
  if (type === 'payment') return -Math.abs(Number(entry.paymentMinor ?? entry.totalMinor ?? 0));
  if (type === 'adjustment') return Number(entry.dueMinor ?? entry.totalMinor ?? 0);
  return Number(entry.dueMinor ?? ((entry.totalMinor ?? entry.purchaseTotalMinor ?? 0) - (entry.paidMinor ?? entry.purchasePaidMinor ?? 0)));
}

function supplierLedgerDelta(entry: FirebaseFirestore.DocumentData): number {
  const type = String(entry.type || '').toLowerCase();
  if (type === 'payment') return -Math.abs(Number(entry.paymentMinor ?? 0));
  if (type === 'adjustment') return Number(entry.purchaseDueMinor ?? entry.dueMinor ?? entry.totalMinor ?? 0);
  return Number(entry.purchaseDueMinor ?? entry.dueMinor ?? ((entry.purchaseTotalMinor ?? 0) - (entry.purchasePaidMinor ?? 0)));
}

export const deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const dryRun = data?.dryRun === undefined ? true : parseBoolean(data.dryRun, 'dryRun');
  const clientLimit = data?.clientLimit === undefined ? 1000 : Math.min(Math.max(parseNumber(data.clientLimit, 'clientLimit'), 1), 5000);
  let clientsProcessed = 0;
  let clientsFixed = 0;
  let suppliersProcessed = 0;
  let suppliersFixed = 0;
  const mismatches: Array<{ collection: 'clients' | 'suppliers'; id: string; expected: unknown; actual: unknown }> = [];

  const clientsSnap = await firestore.collection(`companies/${companyId}/clients`).limit(clientLimit).get();
  for (const client of clientsSnap.docs) {
    clientsProcessed += 1;
    const ledgerSnap = await client.ref.collection('ledger').orderBy('createdAt', 'asc').get();
    const balances: Record<string, number> = {};
    let openPurchasesCount = 0;
    let lastActivityAt: unknown = null;
    for (const entryDoc of ledgerSnap.docs) {
      const entry = entryDoc.data();
      const currency = String(entry.currency || 'USD');
      const delta = ledgerDelta(entry);
      balances[currency] = (balances[currency] || 0) + delta;
      if (String(entry.type || '').toLowerCase() === 'purchase' && delta > 0) openPurchasesCount += 1;
      lastActivityAt = entry.createdAt || entry.businessDate || lastActivityAt;
    }
    const current = client.data().outstandingByCurrency || {};
    if (JSON.stringify(current) !== JSON.stringify(balances) || client.data().openPurchasesCount !== openPurchasesCount) {
      clientsFixed += 1;
      mismatches.push({ collection: 'clients', id: client.id, expected: balances, actual: current });
      if (!dryRun) {
        await client.ref.set({
          outstandingByCurrency: balances,
          openPurchasesCount,
          lastActivityAt: lastActivityAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await writeAuditLog(companyId, access.uid, 'REPAIR_CLIENT_BALANCE', 'CLIENT', client.id, current, balances, 'warning');
      }
    }
  }

  const suppliersSnap = await firestore.collection(`companies/${companyId}/suppliers`).limit(clientLimit).get();
  for (const supplier of suppliersSnap.docs) {
    suppliersProcessed += 1;
    const ledgerSnap = await supplier.ref.collection('ledger').orderBy('createdAt', 'asc').get();
    const balances: Record<string, number> = {};
    let overdueCount = 0;
    let lastActivityAt: unknown = null;
    for (const entryDoc of ledgerSnap.docs) {
      const entry = entryDoc.data();
      const currency = String(entry.currency || 'USD');
      const delta = supplierLedgerDelta(entry);
      balances[currency] = (balances[currency] || 0) + delta;
      const dueDate = entry.dueDate instanceof admin.firestore.Timestamp ? entry.dueDate.toDate() : null;
      if (delta > 0 && dueDate && dueDate.getTime() < Date.now()) overdueCount += 1;
      lastActivityAt = entry.createdAt || entry.businessDate || lastActivityAt;
    }
    const current = supplier.data().balanceDueByCurrency || {};
    if (JSON.stringify(current) !== JSON.stringify(balances) || supplier.data().overdueCount !== overdueCount) {
      suppliersFixed += 1;
      mismatches.push({ collection: 'suppliers', id: supplier.id, expected: balances, actual: current });
      if (!dryRun) {
        await supplier.ref.set({
          balanceDueByCurrency: balances,
          overdueCount,
          lastActivityAt: lastActivityAt || FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await writeAuditLog(companyId, access.uid, 'REPAIR_SUPPLIER_BALANCE', 'SUPPLIER', supplier.id, current, balances, 'warning');
      }
    }
  }

  return { clientsProcessed, clientsFixed, suppliersProcessed, suppliersFixed, mismatches, dryRun };
});

async function computeAnalytics(companyId: string) {
  const baseCurrency = await getCompanyBaseCurrency(companyId);
  const [salesSnap, expensesSnap, productsSnap, clientsSnap, suppliersSnap, incomingSnap] = await Promise.all([
    firestore.collection(`companies/${companyId}/sales`).limit(5000).get(),
    firestore.collection(`companies/${companyId}/dailyExpenses`).limit(5000).get(),
    firestore.collection(`companies/${companyId}/products`).limit(5000).get(),
    firestore.collection(`companies/${companyId}/clients`).limit(5000).get(),
    firestore.collection(`companies/${companyId}/suppliers`).limit(5000).get(),
    firestore.collection(`companies/${companyId}/incomingProducts`).limit(5000).get(),
  ]);

  let totalRevenueMinor = 0;
  let totalExpensesMinor = 0;
  let costOfGoodsSoldMinor = 0;
  let grossProfitMinor = 0;
  let vatCollectedMinor = 0;
  let vatPaidMinor = 0;
  let inventoryValueMinor = 0;
  let lowStockCount = 0;
  let salesCount = 0;
  let unpaidSalesCount = 0;
  let paidSalesCount = 0;
  let partialSalesCount = 0;
  const salesBreakdown = { cash: 0, partial: 0, loan: 0 };
  const totalClientDebtByCurrency: Record<string, number> = {};
  const totalSupplierDebtByCurrency: Record<string, number> = {};

  for (const saleDoc of salesSnap.docs) {
    const sale = saleDoc.data();
    if (sale.status === 'CANCELLED') continue;
    salesCount += 1;
    const revenue = Number(sale.revenueBaseMinor ?? (sale.baseCurrency === baseCurrency ? sale.revenueMinor : 0) ?? 0);
    totalRevenueMinor += revenue;
    costOfGoodsSoldMinor += Number(sale.costOfGoodsSoldBaseMinor ?? 0);
    grossProfitMinor += Number(sale.grossProfitBaseMinor ?? (revenue - Number(sale.costOfGoodsSoldBaseMinor ?? 0)));
    vatCollectedMinor += Number(sale.totals?.vatTotal ?? sale.vat?.vatMinor ?? 0);
    const due = Number(sale.totals?.dueTotal ?? sale.dueMinor ?? 0);
    const paid = Number(sale.totals?.paidTotal ?? sale.paidMinor ?? 0);
    if (due <= 0) paidSalesCount += 1;
    else if (paid > 0) partialSalesCount += 1;
    else unpaidSalesCount += 1;
    const paymentType = String(sale.paymentType || '').toLowerCase();
    if (paymentType === 'cash') salesBreakdown.cash += 1;
    else if (paymentType === 'partial') salesBreakdown.partial += 1;
    else if (paymentType === 'loan') salesBreakdown.loan += 1;
  }

  for (const expenseDoc of expensesSnap.docs) {
    const expense = expenseDoc.data();
    totalExpensesMinor += Number(expense.amountBaseMinor ?? (expense.currency === baseCurrency ? expense.amountMinor : 0) ?? 0);
    vatPaidMinor += Number(expense.vat?.vatMinor ?? expense.vatMinor ?? 0);
  }

  for (const incomingDoc of incomingSnap.docs) {
    const incoming = incomingDoc.data();
    vatPaidMinor += Number(incoming.vat?.vatTotalMinor ?? incoming.vatMinor ?? 0);
  }

  for (const productDoc of productsSnap.docs) {
    const product = productDoc.data();
    const qty = Number(product.quantity ?? 0);
    const unitCostBase = Number(product.costBaseMinor ?? (product.purchasePriceCurrency === baseCurrency ? product.purchasePriceMinor : 0) ?? 0);
    inventoryValueMinor += safeRoundMinor(qty * unitCostBase);
    if (qty <= Number(product.minStock ?? 0)) lowStockCount += 1;
  }

  for (const clientDoc of clientsSnap.docs) {
    const balances = clientDoc.data().outstandingByCurrency || {};
    for (const [currency, amount] of Object.entries(balances)) {
      totalClientDebtByCurrency[currency] = (totalClientDebtByCurrency[currency] || 0) + Number(amount);
    }
  }

  for (const supplierDoc of suppliersSnap.docs) {
    const balances = supplierDoc.data().balanceDueByCurrency || {};
    for (const [currency, amount] of Object.entries(balances)) {
      totalSupplierDebtByCurrency[currency] = (totalSupplierDebtByCurrency[currency] || 0) + Number(amount);
    }
  }

  const netProfitMinor = grossProfitMinor - totalExpensesMinor;
  const vatPayableMinor = vatCollectedMinor - vatPaidMinor;

  return {
    companyId,
    baseCurrency,
    totalRevenueMinor,
    totalExpensesMinor,
    costOfGoodsSoldMinor,
    grossProfitMinor,
    netProfitMinor,
    vatCollectedMinor,
    vatPaidMinor,
    vatPayableMinor,
    inventoryValueMinor,
    lowStockCount,
    totalClientDebtByCurrency,
    totalSupplierDebtByCurrency,
    salesCount,
    unpaidSalesCount,
    paidSalesCount,
    partialSalesCount,
    salesBreakdown,
    auditStatus: 'unknown',
    source: 'server',
    generatedAt: FieldValue.serverTimestamp(),
  };
}

export const computeCompanyAnalytics = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, VIEW_ROLES);
  const analytics = await computeAnalytics(companyId);
  await firestore.doc(`companies/${companyId}/analytics/current`).set({
    ...analytics,
    generatedBy: access.uid,
  }, { merge: true });
  return { success: true, analytics: { ...analytics, generatedAt: new Date().toISOString() } };
});

export const recalculateAllClientBalances = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  return deepRepairFinancials.run(data, context);
});

export const updateDashboardStats = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  return computeCompanyAnalytics.run(data, context);
});

export const updateMonthlyRevenue = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const period = parseString(data?.period || new Date().toISOString().slice(0, 7), 'period');
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new functions.https.HttpsError('invalid-argument', 'period must be YYYY-MM.');
  }
  const analytics = await computeAnalytics(companyId);
  const docId = period.replace('-', '');
  await firestore.doc(`companies/${companyId}/analytics/monthly/${docId}`).set({
    ...analytics,
    period,
    generatedBy: access.uid,
  }, { merge: true });
  return { success: true, period, analytics: { ...analytics, generatedAt: new Date().toISOString() } };
});

export const updateClientBalances = functions.region('us-central1').runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  return deepRepairFinancials.run(data, context);
});
