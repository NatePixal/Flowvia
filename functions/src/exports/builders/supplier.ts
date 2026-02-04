// functions/src/exports/builders/supplier.ts
import * as admin from 'firebase-admin';
import { resolveFxToBase } from '../fx';
import { minorToMajor } from '../money';
import { StatementRow, StatementSummary, CurrencyTotalsOrig, Currency } from '../types';

const db = admin.firestore();

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function buildSupplierStatement(params: {
  companyId: string;
  supplierId: string;
  from: Date;
  to: Date;
  baseCurrency: Currency;
}): Promise<{ summary: StatementSummary; rows: StatementRow[] }> {
  const { companyId, supplierId, from, to, baseCurrency } = params;

  const supplierRef = db.doc(`companies/${companyId}/suppliers/${supplierId}`);
  const supplierSnap = await supplierRef.get();
  const supplierName = (supplierSnap.data() as any)?.name || supplierId;

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
  const warnings: string[] = [];
  const totalsByCurrencyOrig: CurrencyTotalsOrig = {};
  let missingFxCount = 0;

  // AP semantics:
  // purchase increases payable (CREDIT), payment decreases payable (DEBIT)
  async function entryDeltaBase(e: any, date: Date, forOpening: boolean) {
    const currency: Currency = e.currency || baseCurrency;
    const isPurchase = e.type === 'purchase';
    const isPayment = e.type === 'payment';

    const creditMinor = isPurchase ? Number(e.purchaseTotalMinor ?? e.totalMinor ?? 0) : 0;
    const debitMinor = isPayment ? Number(e.paymentMinor ?? 0) : 0;

    const creditOrig = minorToMajor(creditMinor, currency);
    const debitOrig = minorToMajor(debitMinor, currency);

    if (!forOpening) {
      totalsByCurrencyOrig[currency] ||= { debit: 0, credit: 0 };
      totalsByCurrencyOrig[currency].debit += debitOrig;
      totalsByCurrencyOrig[currency].credit += creditOrig;
    }

    const fx = await resolveFxToBase({
      companyId,
      txCurrency: currency,
      baseCurrency,
      txDate: date,
      stored: { fxRateToBase: e.fxRateToBase, fxAsOf: e.fxAsOf },
    });

    if (!fx.ok) {
      missingFxCount++;
      return { ok: false as const, currency, debitOrig, creditOrig, fx };
    }

    const debitBase = debitOrig * fx.rateToBase;
    const creditBase = creditOrig * fx.rateToBase;

    const deltaBase = creditBase - debitBase; // payable increases with credit

    if (forOpening) openingBase += deltaBase;

    return { ok: true as const, currency, debitOrig, creditOrig, debitBase, creditBase, deltaBase, fx };
  }

  for (const d of beforeSnap.docs) {
    const e = d.data();
    const date = toDate(e[DATE_FIELD]) ?? toDate(e.createdAt) ?? from;
    await entryDeltaBase(e, date, true);
  }

  runningBase = openingBase;

  const rows: StatementRow[] = [];
  for (const doc of rangeSnap.docs) {
    const e = doc.data();
    const date = toDate(e[DATE_FIELD]) ?? toDate(e.createdAt) ?? from;

    const currency: Currency = e.currency || baseCurrency;
    const isPurchase = e.type === 'purchase';
    const isPayment = e.type === 'payment';

    const creditMinor = isPurchase ? Number(e.purchaseTotalMinor ?? e.totalMinor ?? 0) : 0;
    const debitMinor = isPayment ? Number(e.paymentMinor ?? 0) : 0;

    const creditOrig = minorToMajor(creditMinor, currency);
    const debitOrig = minorToMajor(debitMinor, currency);

    totalsByCurrencyOrig[currency] ||= { debit: 0, credit: 0 };
    totalsByCurrencyOrig[currency].debit += debitOrig;
    totalsByCurrencyOrig[currency].credit += creditOrig;

    const fx = await resolveFxToBase({
      companyId,
      txCurrency: currency,
      baseCurrency,
      txDate: date,
      stored: { fxRateToBase: e.fxRateToBase, fxAsOf: e.fxAsOf },
    });

    let debitBase = 0;
    let creditBase = 0;
    let fxAsOf: Date | null = null;
    let fxRateToBase: number | null = null;
    let fxStatus: 'OK' | 'MISSING' = 'OK';

    if (fx.ok) {
      fxAsOf = fx.asOf;
      fxRateToBase = fx.rateToBase;

      debitBase = debitOrig * fx.rateToBase;
      creditBase = creditOrig * fx.rateToBase;

      runningBase = runningBase + creditBase - debitBase;
    } else {
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

  const summary: StatementSummary = {
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
