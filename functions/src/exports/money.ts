// functions/src/exports/money.ts
// THIS FILE IS A PLACEHOLDER. ITS ORIGINAL CONTENT WAS NOT AVAILABLE.
// Please provide the correct source code to restore its functionality.

export function currencyDecimals(currency: string): number {
  const DECIMALS: Record<string, number> = { USD: 2, AED: 2, CNY: 2, UZS: 0 };
  return DECIMALS[currency] ?? 2;
}

export function excelNumFmtForCurrency(currency: string): string {
    if (currency === 'QTY') return '#,##0';
    const d = currencyDecimals(currency);
    if (d <= 0) return '#,##0';
    return '#,##0.' + '0'.repeat(d);
}
