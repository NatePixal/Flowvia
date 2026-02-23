
import React from 'react';
import AppGate from './AppGate';
import AppShell from '@/components/layout/app-shell';
import { CurrencyProvider } from '@/lib/currency-provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
      <CurrencyProvider>
        <AppGate>
          <AppShell>{children}</AppShell>
        </AppGate>
      </CurrencyProvider>
  );
}
