
'use client';

import { useFirebase } from '@/firebase';
import Header from './header';
import { SidebarProvider, Sidebar, SidebarRail, SidebarInset } from '../ui/sidebar';
import AppSidebar from './app-sidebar';
import { Toaster } from '../ui/toaster';
import { useTranslation } from 'react-i18next';
import React from 'react';

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}

const AppShellFallback = () => {
    const { t } = useTranslation();
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
              <p className="text-sm font-medium text-muted-foreground">{t('misc.loading')}...</p>
            </div>
        </div>
    );
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { sessionReady, user, isCompanyMember, isDeveloper, missingCompanyScope, needsOnboarding } = useFirebase();

  if (!sessionReady) return <AppShellFallback />;

  // Signed-out users should never be stuck inside the app shell.
  // The (app) layout will redirect them to /login.
  if (!user) return <AppShellFallback />;

  if (missingCompanyScope) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold">Missing company access</h1>
          <p className="text-sm text-muted-foreground">
            Your account is signed in, but your token has no companyId claim. Run backfill or refresh token.
          </p>
        </div>
      </div>
    );
  }

  // Handle case where user is not a developer or member of a company and is not currently in an onboarding flow
  if (!isCompanyMember && !isDeveloper && !needsOnboarding) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background p-6">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-lg font-semibold">Access restricted</h1>
          <p className="text-sm text-muted-foreground">
            Your account does not have access to any company workspace.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarRail />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-y-auto">
          <PageContainer>
            {children}
          </PageContainer>
        </main>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
