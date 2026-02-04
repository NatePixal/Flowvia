// functions/src/exports/types.ts
// THIS FILE IS A PLACEHOLDER. ITS ORIGINAL CONTENT WAS NOT AVAILABLE.
// Please provide the correct source code to restore its functionality.

export type Currency = 'USD' | 'AED' | 'UZS' | 'CNY';
export type StatementCurrency = Currency | 'QTY';

export interface StatementRow {
    businessDate: Date;
    description: string;
    reference: string;
    type: string;
    currency: StatementCurrency;
    debitOrig?: number;
    creditOrig?: number;
    fxAsOf?: Date | null;
    fxRateToBase?: number | null;
    fxStatus?: 'OK' | 'MISSING';
    debitBase?: number;
    creditBase?: number;
    runningBase?: number;
}
export interface StatementSummary {
    title: string;
    companyId: string;
    periodFrom: Date;
    periodTo: Date;
    entityLabel: string;
    baseCurrency: StatementCurrency;
    openingBase: number;
    totalDebitBase: number;
    totalCreditBase: number;
    closingBase: number;
    txCount: number;
    warnings: string[];
    totalsByCurrencyOrig: {
        [key: string]: {
            debit: number;
            credit: number;
        };
    };
}
