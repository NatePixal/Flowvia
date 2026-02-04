
// functions/src/exports/builders/client.ts
import * as admin from 'firebase-admin';
import { resolveFxToBase } from '../fx';
import { minorToMajor } from '../money';
import { StatementRow, StatementSummary, Currency } from '../types';

const db = admin.firestore();

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function buildClientStatement(params: {
  companyId: string;
  clientId: string;
  from: Date;
  to: Date;
  baseCurrency: Currency;
}): Promise<{ summary: StatementSummary; rows: StatementRow[] }> {
  const { companyId, clientId, from, to, baseCurrency } = params;

  const clientRef = db.doc(`companies/${companyId}/clients/${clientId}`);
  const clientSnap = await clientRef.get();
  const clientName = (clientSnap.data() as any)?.name || clientId;

  const ledgerRef = db.collection(`companies/${companyId}/clients/${clientId}/ledger`);

  // IMPORTANT: ideally ledger should have businessDate.
  // If not, you must adapt the query field to your model.
  const DATE_FIELD = 'businessDate'; // preferred
  // Fallback: if your ledger doesn't have businessDate, use 'createdAt' and accept limitations.

  const fromTs = admin.firestore.Timestamp.fromDate(from);
  const toTs = admin.firestore.Timestamp.fromDate(to);

  // Opening: all entries before "from"
  const beforeSnap = await ledgerRef.where(DATE_FIELD, '<', fromTs).get();

  // In-range: entries between from..to ordered
  const rangeSnap = await ledgerRef
    .where(DATE_FIELD, '>=', fromTs)
    .where(DATE_FIELD, '<=', toTs)
    .orderBy(DATE_FIELD, 'asc')
    .get();

  let openingBase = 0;
  const warnings: string[] = [];
  const totalsByCurrencyOrig: Record<string, { debit: number; credit: number }> = {};
  let missingFxCount = 0;

  // Helper: apply one ledger entry into base totals
  async function applyEntryToBase(e: any, date: Date, isForOpening: boolean) {
    const currency = e.currency || baseCurrency;
    const isPurchase = e.type === 'purchase';
    const isPayment = e.type === 'payment';

    const debitMinor = isPurchase ? Number(e.totalMinor ?? 0) : 0;
    const creditMinor = isPayment ? Number(e.paymentMinor ?? e.totalMinor ?? 0) : 0;

    const debitOrig = minorToMajor(debitMinor, currency);
    const creditOrig = minorToMajor(creditMinor, currency);

    // Totals-by-currency only for in-range rows (not opening)
    if (!isForOpening) {
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
      return { ok: false, debitOrig, creditOrig, currency, fx };
    }

    const debitBase = debitOrig * fx.rateToBase;
    const creditBase = creditOrig * fx.rateToBase;

    // For AR: running/outstanding increases with purchases (debit), decreases with payments (credit)
    const deltaBase = debitBase - creditBase;

    if (isForOpening) openingBase += deltaBase;
    
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
    const date = toDate(e[DATE_FIELD]) ?? toDate(e.createdAt) ?? from; // fallback
    await applyEntryToBase(e, date, true);
  }

  // Build statement rows with runningBase
  let runningBase = openingBase;
  const rows: StatementRow[] = [];

  for (const doc of rangeSnap.docs) {
    const e = doc.data();
    const date = toDate(e[DATE_FIELD]) ?? toDate(e.createdAt) ?? from;
    const ref = doc.id;
    const isPurchase = e.type === 'purchase';
    const isPayment = e.type === 'payment';
    const currency = e.currency || baseCurrency;

    const debitMinor = isPurchase ? Number(e.totalMinor ?? 0) : 0;
    const creditMinor = isPayment ? Number(e.paymentMinor ?? e.totalMinor ?? 0) : 0;
    const debitOrig = minorToMajor(debitMinor, currency);
    const creditOrig = minorToMajor(creditMinor, currency);
    
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
      runningBase = runningBase + debitBase - creditBase;
    } else {
      fxStatus = 'MISSING';
      missingFxCount++;
      // runningBase unchanged
    }
    
    const description = isPurchase && Array.isArray(e.items) && e.items.length
      ? e.items.map((it: any) => `${it.qty}× ${it.name}`).join(', ')
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
    });
  }

  if (missingFxCount > 0) {
    warnings.push(`FX missing on ${missingFxCount} row(s). Base totals/running may be incomplete.`);
  }

  const totalDebitBase = rows.reduce((s, x) => s + (x.debitBase || 0), 0);
  const totalCreditBase = rows.reduce((s, x) => s + (x.creditBase || 0), 0);
  const closingBase = rows.length ? (rows[rows.length - 1].runningBase ?? openingBase) : openingBase;

  const summary: StatementSummary = {
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
