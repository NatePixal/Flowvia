
// functions/src/exports/money.ts

// IMPORTANT: match your real app config here.
// UZS should be 0 in practice for your business.
const DECIMALS: Record<string, number> = {
    USD: 2,
    AED: 2,
    CNY: 2,
    UZS: 0,
};

export function currencyDecimals(currency: string): number {
    return DECIMALS[currency] ?? 2;
}

export function minorToMajor(minor: number, currency: string): number {
    const d = currencyDecimals(currency);
    const div = Math.pow(10, d);
    return Number(minor || 0) / div;
}

// Excel number format: "#,##0" or "#,##0.00"
export function excelNumFmtForCurrency(currency: string): string {
    if (currency === 'QTY') return '#,##0';

    const d = currencyDecimals(currency);
    if (d <= 0) return '#,##0';
    return '#,##0.' + '0'.repeat(d);
}
