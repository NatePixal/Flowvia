
import type { Currency, FxSnapshot } from './types';
import { CURRENCY_DECIMALS as currencyDecimals } from './currency-config';
export type { Currency, FxSnapshot } from './types';

export const CURRENCY_DECIMALS: Record<string, number> = currencyDecimals;

/**
 * Converts a major currency unit (e.g., 12.50) to its minor unit (e.g., 1250 for USD).
 */
export function toMinor(amount: number, currency: Currency): number {
  if (amount === null || amount === undefined) return 0;
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor);
}

/**
 * Converts a minor currency unit (e.g., 1250) to its major unit (e.g., 12.50 for USD).
 */
export function fromMinor(minor: number, currency: Currency): number {
  if (minor === null || minor === undefined) return 0;
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const factor = Math.pow(10, decimals);
  return n / factor;
}

/**
 * Ensures a number is not negative, returning 0 if it is.
 */
export function clampNonNegative(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Formats an amount in minor units into a human-readable currency string.
 */
export function formatMoneyMinor(minor: number, currency: Currency): string {
  const safeMinor = Number.isFinite(Number(minor)) ? Number(minor) : 0;
  const value = fromMinor(safeMinor, currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: CURRENCY_DECIMALS[currency] ?? 2,
      maximumFractionDigits: CURRENCY_DECIMALS[currency] ?? 2,
    }).format(value);
  } catch {
    return `${value.toFixed(CURRENCY_DECIMALS[currency] ?? 2)} ${currency}`;
  }
}

/**
 * Safe integer math helpers (minor units).
 */
export function addMinor(a: number, b: number): number {
  const x = Number.isFinite(Number(a)) ? Number(a) : 0;
  const y = Number.isFinite(Number(b)) ? Number(b) : 0;
  return Math.round(x + y);
}

export function subtractMinor(a: number, b: number): number {
  const x = Number.isFinite(Number(a)) ? Number(a) : 0;
  const y = Number.isFinite(Number(b)) ? Number(b) : 0;
  return Math.round(x - y);
}

export function multiplyMinor(minor: number, quantity: number): number {
  const m = Number.isFinite(Number(minor)) ? Number(minor) : 0;
  const q = Number.isFinite(Number(quantity)) ? Number(quantity) : 0;
  return Math.round(m * q);
}

/**
 * Normalizes a user-entered exchange rate to "base per 1 txn currency".
 */
export function normalizeRateToBase(
  enteredRate: number,
  enteredPair: string,
  txnCurrency: Currency,
  baseCurrency: Currency
): number {
  const r = Number(enteredRate);
  if (!Number.isFinite(r) || r <= 0) {
    throw new Error('Invalid exchange rate provided.');
  }

  const [from, to] = enteredPair.split('->');

  // Case 1: already txn -> base (base per 1 txn)
  if (from === txnCurrency && to === baseCurrency) {
    return r;
  }

  // Case 2: inverted base -> txn (txn per 1 base), invert to get base per 1 txn
  if (from === baseCurrency && to === txnCurrency) {
    return 1 / r;
  }

  throw new Error(
    `Inconsistent currency pair "${enteredPair}" for conversion from ${txnCurrency} to ${baseCurrency}.`
  );
}

/**
 * Converts txn currency minor -> base currency minor using normalized rateToBase.
 */
export function convertMinorToBase(
  txnMinor: number,
  rateToBase: number,
  txnCurrency: Currency,
  baseCurrency: Currency
): number {
  const txnMajor = fromMinor(txnMinor, txnCurrency);
  const baseMajor = txnMajor * rateToBase;
  return toMinor(baseMajor, baseCurrency);
}

/**
 * Converts base currency minor -> txn currency minor using normalized rateToBase.
 */
export function convertBaseToMinor(
  baseMinor: number,
  rateToBase: number,
  txnCurrency: Currency,
  baseCurrency: Currency
): number {
  const r = Number(rateToBase);
  if (!Number.isFinite(r) || r === 0) return 0;
  const baseMajor = fromMinor(baseMinor, baseCurrency);
  const txnMajor = baseMajor / r;
  return toMinor(txnMajor, txnCurrency);
}

/**
 * Converts amount from source currency to target currency via base currency.
 *
 * NEVER convert non-base -> non-base directly.
 * Always: Source -> Base -> Target
 */
export function convertCurrency(
  amountMinor: number,
  sourceCurrency: Currency,
  targetCurrency: Currency,
  baseCurrency: Currency,
  sourceFx?: FxSnapshot,
  targetFx?: FxSnapshot
): number {
  if (sourceCurrency === targetCurrency) return Math.round(amountMinor);

  // 1) Source -> Base
  let baseMinor: number;
  if (sourceCurrency === baseCurrency) {
    baseMinor = Math.round(amountMinor);
  } else {
    if (!sourceFx) {
      throw new Error(`FX snapshot required to convert ${sourceCurrency} -> ${baseCurrency}`);
    }
    baseMinor = convertMinorToBase(amountMinor, sourceFx.rateToBase, sourceCurrency, baseCurrency);
  }

  // 2) Base -> Target
  if (targetCurrency === baseCurrency) return Math.round(baseMinor);

  if (!targetFx) {
    throw new Error(`FX snapshot required to convert ${baseCurrency} -> ${targetCurrency}`);
  }

  return convertBaseToMinor(baseMinor, targetFx.rateToBase, targetCurrency, baseCurrency);
}
