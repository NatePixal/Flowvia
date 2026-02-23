
import React from 'react';
import AppGate from './AppGate';
import AppShell from '@/components/layout/app-shell';
import { CurrencyProvider } from '@/lib/currency-provider';
import { FirebaseClientProvider } from '@/firebase';

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
