
// functions/src/exports/types.ts

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
    fxStatus?: 'OK' | 'MISSING' | 'STORED_BASE';
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

