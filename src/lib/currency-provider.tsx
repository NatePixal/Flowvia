'use client';

import React, { createContext, useContext, useState, useMemo, ReactNode, useEffect, useCallback } from 'react';
import type { Currency } from './types';
import { useFirebase } from '@/firebase';

export const DEFAULT_BASE_CURRENCY: Currency = 'USD';

// Reference rates in "currency units per 1 USD" (display-only helper for legacy UI paths).
// Core transaction math in the app should use per-transaction FX snapshots and minor units.
export const exchangeRatesPerUsd: Record<Currency, number> = {
  USD: 1,
  UZS: 12650,
  AED: 3.67,
  CNY: 7.24,
  SAR: 3.75,
  JOD: 0.71,
  EGP: 48.5,
};

// Backward-compatible export name used by older screens
export const exchangeRates = exchangeRatesPerUsd;

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (amountInBase: number, currency?: Currency) => string;
  baseCurrency: Currency;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

function convertMajorViaUsd(amount: number, from: Currency, to: Currency): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const fromPerUsd = exchangeRatesPerUsd[from];
  const toPerUsd = exchangeRatesPerUsd[to];
  if (!fromPerUsd || !toPerUsd) return amount;
  const amountUsd = amount / fromPerUsd;
  return amountUsd * toPerUsd;
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { userProfile, companyBaseCurrency } = useFirebase();
  const resolvedBaseCurrency = (companyBaseCurrency || DEFAULT_BASE_CURRENCY) as Currency;
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(
    (userProfile?.currency || resolvedBaseCurrency || DEFAULT_BASE_CURRENCY) as Currency
  );

  useEffect(() => {
    const next = (userProfile?.currency || resolvedBaseCurrency || DEFAULT_BASE_CURRENCY) as Currency;
    if (next && next !== displayCurrency) {
      setDisplayCurrency(next);
    }
  }, [userProfile?.currency, resolvedBaseCurrency, displayCurrency]);

  const formatCurrency = useCallback(
    (amountInBase: number, currency?: Currency) => {
      const targetCurrency = (currency || displayCurrency) as Currency;
      const converted = convertMajorViaUsd(Number(amountInBase) || 0, resolvedBaseCurrency, targetCurrency);

      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: targetCurrency,
      }).format(converted);
    },
    [displayCurrency, resolvedBaseCurrency]
  );

  const value = useMemo(
    () => ({
      currency: displayCurrency,
      setCurrency: setDisplayCurrency,
      formatCurrency,
      baseCurrency: resolvedBaseCurrency,
    }),
    [displayCurrency, formatCurrency, resolvedBaseCurrency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
