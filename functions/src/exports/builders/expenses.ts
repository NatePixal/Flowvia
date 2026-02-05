
// functions/src/exports/builders/expenses.ts
import * as admin from 'firebase-admin';
import { resolveFxToBase } from '../fx';
import { minorToMajor } from '../money';
import { StatementRow, StatementSummary, Currency } from '../types';

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function buildExpensesStatement(params: {
  companyId: string;
  from: Date;
  to: Date;
  baseCurrency: Currency;
}): Promise<{ summary: StatementSummary; rows: StatementRow[] }> {
  const db = admin.firestore();
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

  const warnings: string[] = [];
  const totalsByCurrencyOrig: Record<string, { debit: number; credit: number }> = {};
  let missingFxCount = 0;

  const rows: StatementRow[] = [];
  for (const doc of rangeSnap.docs) {
    const e = doc.data();
    const date = toDate(e[DATE_FIELD]) ?? toDate(e.createdAt) ?? from;
    const currency = e.currency || baseCurrency;

    // If you support refunds, set creditMinor accordingly.
    const debitMinor = Number(e.amountMinor ?? e.totalMinor ?? 0);
    const creditMinor = Number(e.refundMinor ?? 0);
    
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
  const closingBase = rows.length ? (rows[rows.length - 1].runningBase ?? openingBase) : openingBase;

  const summary: StatementSummary = {
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
