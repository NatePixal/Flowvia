
// functions/src/exports/fx.ts
import * as admin from 'firebase-admin';

const db = admin.firestore();

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve FX for a single transaction row.
 * - If currency == baseCurrency => rate 1
 * - Prefer stored fxRateToBase + fxAsOf on the record if present
 * - Else fallback to nearest snapshot where asOf <= txDate
 */
export async function resolveFxToBase(params: {
  companyId: string;
  txCurrency: string;
  baseCurrency: string;
  txDate: Date;
  stored?: { fxRateToBase?: number | null; fxAsOf?: any | null };
}): Promise<
  | { ok: true; rateToBase: number; asOf: Date; source: 'identity' | 'stored' | 'snapshot' }
  | { ok: false; reason: 'missing_fx_snapshot' | 'missing_rate_for_currency' }
> {
  const { companyId, txCurrency, baseCurrency, txDate, stored } = params;

  if (txCurrency === baseCurrency) {
    return { ok: true, rateToBase: 1, asOf: txDate, source: 'identity' };
  }

  const storedRate = typeof stored?.fxRateToBase === 'number' ? stored.fxRateToBase : null;
  const storedAsOf = toDateSafe(stored?.fxAsOf);

  if (storedRate && storedRate > 0 && storedAsOf) {
    return { ok: true, rateToBase: storedRate, asOf: storedAsOf, source: 'stored' };
  }

  // Fallback snapshot lookup:
  // companies/{companyId}/fxSnapshots : { asOf, baseCurrency, ratesToBase{USD:1, UZS:..., AED:...} }
  const snap = await db
    .collection(`companies/${companyId}/fxSnapshots`)
    .where('baseCurrency', '==', baseCurrency)
    .where('asOf', '<=', admin.firestore.Timestamp.fromDate(txDate))
    .orderBy('asOf', 'desc')
    .limit(1)
    .get();

  if (snap.empty) {
    return { ok: false, reason: 'missing_fx_snapshot' };
  }
  
  const doc = snap.docs[0].data();
  const rate = doc?.ratesToBase?.[txCurrency];

  if (!rate || rate <= 0) {
    return { ok: false, reason: 'missing_rate_for_currency' };
  }

  const asOf = doc.asOf.toDate();
  return { ok: true, rateToBase: rate, asOf, source: 'snapshot' };
}
