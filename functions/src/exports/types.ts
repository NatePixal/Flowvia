// functions/src/exports/types.ts
import { Timestamp } from 'firebase-admin/firestore';

export type Currency = 'USD' | 'UZS' | 'AED' | 'CNY' | string;
export type StatementCurrency = Currency | 'QTY';

export type StatementType = 'client' | 'supplier' | 'expenses' | 'productMovement';

export type FxResolution =
  | { ok: true; rateToBase: number; asOf: Date; source: 'identity' | 'stored' | 'snapshot' }
  | { ok: false; reason: 'missing_fx_snapshot' | 'missing_rate_for_currency' };

export type StatementRow = {
  businessDate: Date;
  description: string;
  reference: string;
  type: string;

  currency: StatementCurrency;

  fxAsOf?: Date | null;
  fxRateToBase?: number | null;
  fxStatus?: 'OK' | 'MISSING';

  debitOrig: number;   // major units (human)
  creditOrig: number;  // major units (human)

  debitBase: number;   // major units (base)
  creditBase: number;  // major units (base)

  runningBase: number; // major units (base)
};

export type CurrencyTotalsOrig = Record<string, { debit: number; credit: number }>;

export type StatementSummary = {
  title: string;
  companyId: string;
  periodFrom: Date;
  periodTo: Date;

  entityLabel: string; // "Client: Hamza Denov" etc
  baseCurrency: StatementCurrency;

  openingBase: number;
  totalDebitBase: number;
  totalCreditBase: number;
  closingBase: number;

  txCount: number;
  warnings: string[];

  totalsByCurrencyOrig: CurrencyTotalsOrig;
};

export type FxSnapshotDoc = {
  asOf: Timestamp;
  baseCurrency: Currency;
  ratesToBase: Record<string, number>; // baseMajor per 1 unit currency major
};
