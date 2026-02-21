import React from 'react';
import AppGate from './AppGate';
import AppShell from '@/components/layout/app-shell';
import { FirebaseClientProvider } from '@/firebase';
import { CurrencyProvider } from '@/lib/currency-provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseClientProvider>
      <CurrencyProvider>
        <AppGate>
          <AppShell>{children}</AppShell>
        </AppGate>
      </CurrencyProvider>
    </FirebaseClientProvider>
  );
}
