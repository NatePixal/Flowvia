
// functions/src/exports/builders/expenses.ts
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../../admin';
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
  const { companyId, from, to, baseCurrency } = params;

  // Adjust collection name if needed (dailyExpenses vs expenses)
  const ref = db.collection(`companies/${companyId}/dailyExpenses`);

  // BUSINESS date field required:
  const DATE_FIELD = 'businessDate';

  const fromTs = Timestamp.fromDate(from);
  const toTs = Timestamp.fromDate(to);

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
    const date =
      toDate(e.businessDate) ??
      toDate(e.date) ??              // your UI "Date"
      toDate(e.createdAt) ??
      from;

    const currency = e.currency || baseCurrency;

    // amountMinor is what your UI stores (UZS etc)
    const debitMinor = Number(e.amountMinor ?? e.totalMinor ?? 0);
    const creditMinor = Number(e.refundMinor ?? 0);

    const debitOrig = minorToMajor(debitMinor, currency);
    const creditOrig = minorToMajor(creditMinor, currency);
    
    totalsByCurrencyOrig[currency] ||= { debit: 0, credit: 0 };
    totalsByCurrencyOrig[currency].debit += debitOrig;
    totalsByCurrencyOrig[currency].credit += creditOrig;

    // ✅ READ LOCKED FX FROM e.fx.* (your real data)
    const storedRate = typeof e.fx?.rateToBase === 'number' ? e.fx.rateToBase : e.fxRateToBase;
    const storedAsOf = toDate(e.fx?.capturedAt) ?? toDate(e.fxAsOf);

    // If you already store base minor, use it even if snapshots are missing:
    const baseMinor = typeof e.amountBaseMinor === 'number' ? e.amountBaseMinor : null;

    const fx = await resolveFxToBase({
      companyId,
      txCurrency: currency,
      baseCurrency,
      txDate: date,
      stored: { fxRateToBase: storedRate, fxAsOf: storedAsOf },
    });

    let debitBase = 0;
    let creditBase = 0;
    let fxAsOf: Date | null = null;
    let fxRateToBase: number | null = null;
    let fxStatus: 'OK' | 'MISSING' | 'STORED_BASE' = 'OK';

    if (currency === baseCurrency) {
      fxAsOf = date;
      fxRateToBase = 1;
      debitBase = debitOrig;
      creditBase = creditOrig;
      runningBase = runningBase + debitBase - creditBase;
    } else if (baseMinor !== null) {
      // ✅ strongest source: saved base amount
      debitBase = minorToMajor(baseMinor, baseCurrency);
      fxRateToBase = debitOrig > 0 ? (debitBase / debitOrig) : (fx.ok ? fx.rateToBase : null);
      fxAsOf = storedAsOf ?? (fx.ok ? fx.asOf : null);
      fxStatus = 'STORED_BASE';
      runningBase = runningBase + debitBase - creditBase;
    } else if (fx.ok) {
      fxAsOf = fx.asOf;
      fxRateToBase = fx.rateToBase;
      debitBase = debitOrig * fx.rateToBase;
      creditBase = creditOrig * fx.rateToBase;
      runningBase = runningBase + debitBase - creditBase;
    } else {
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

      // ledger fields (kept for consistency)
      fxAsOf,
      fxRateToBase,
      fxStatus,
      debitOrig,
      creditOrig,
      debitBase,
      creditBase,
      runningBase,

      // ✅ extra fields for the new Engine
      category,
      paidTo,
      employee,
      createdBy,
      fxPair: e.fx?.enteredPair || '',
      fxEnteredRate: e.fx?.enteredRate ?? null,

      meta: {
        expenseType: category,
        paid_to_seller_name: paidTo,
        employee_name: employee,
        enteredPair: e.fx?.enteredPair,
        enteredRate: e.fx?.enteredRate,
      },
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
