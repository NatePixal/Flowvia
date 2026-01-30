import React from 'react';
import AppGate from './AppGate';
import AppShell from '@/components/layout/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Note: FirebaseClientProvider is already in the root layout, so it's not needed here.
  return (
    <AppGate>
      <AppShell>{children}</AppShell>
    </AppGate>
  );
}
