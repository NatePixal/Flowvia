
'use client';

import { I18nProviderClient } from '@/locales/client';
import { usePathname } from 'next/navigation';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { CurrencyProvider } from '@/lib/currency-provider';
import { Toaster } from '@/components/ui/toaster';
import AppShell from '@/components/layout/app-shell';

// This is the root layout for all pages.
// It is a client component to provide i18n, Firebase, and Currency contexts.
export default function LocaleLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';
  
  const isPublicPage = pathname.endsWith('/login') || pathname.endsWith('/terms') || pathname === `/${locale}`;

  return (
    <FirebaseClientProvider>
      <I18nProviderClient locale={locale}>
          <CurrencyProvider>
            {isPublicPage ? (
              <>
                {children}
                <Toaster />
              </>
            ) : (
              <AppShell>
                {children}
              </AppShell>
            )}
          </CurrencyProvider>
      </I18nProviderClient>
    </FirebaseClientProvider>
  );
}
