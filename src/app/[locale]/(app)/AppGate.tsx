'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { useTranslation } from 'react-i18next';

// Fallback component while auth state is being resolved
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
}

export default function AppGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, sessionReady, isUserLoading } = useFirebase();
  const locale = pathname.split('/')[1] || 'en';

  useEffect(() => {
    if (!sessionReady || isUserLoading) return;
    if (!user) {
      router.replace(`/${locale}/login`);
    }
  }, [user, sessionReady, isUserLoading, router, locale]);

  // While waiting for auth, show a loader instead of a blank screen
  if (!sessionReady || isUserLoading) {
    return <AppShellFallback />;
  }

  // If there's no user, the redirect is happening. Show loader until redirect is complete.
  if (!user) {
    return <AppShellFallback />;
  }

  return <>{children}</>;
}
