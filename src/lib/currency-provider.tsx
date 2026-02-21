'use client';

import React, { createContext, useContext, useState, useMemo, ReactNode, useEffect } from 'react';
import type { Currency } from './types';
import { useFirebase } from '@/firebase'; 
import { formatMoneyMinor } from './money';

export const BASE_CURRENCY: Currency = 'USD';

export const exchangeRates: Record<Currency, number> = {
  USD: 1,
  UZS: 12650,
  AED: 3.67,
  CNY: 7.24,
  SAR: 3.75,
  JOD: 0.71,
  EGP: 48.50,
};

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatCurrency: (amountInBase: number, currency?: Currency) => string; // Kept for API compatibility, but deprecated
  baseCurrency: Currency;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useFirebase();
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD');

  useEffect(() => {
    if (userProfile?.currency && userProfile.currency !== displayCurrency) {
      setDisplayCurrency(userProfile.currency);
    }
  }, [userProfile, displayCurrency]);


  const formatCurrency = (amount: number, currency?: Currency) => {
    // This function is now deprecated for exchange rate conversions.
    // It will throw in development to guide developers to the correct pattern.
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        'DEPRECATED: formatCurrency performs exchange rate conversions. Use formatMoneyMinor(minorUnits, currency) instead to display amounts in their native currency.'
      );
    }
    
    // In production, to avoid a crash, it will just format the number in the user's display currency.
    // This is a graceful degradation, not the intended path.
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || displayCurrency,
    }).format(amount);
  };

  const value = useMemo(
    () => ({
      currency: displayCurrency,
      setCurrency: setDisplayCurrency,
      formatCurrency,
      baseCurrency: BASE_CURRENCY,
    }),
    [displayCurrency, formatCurrency]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
