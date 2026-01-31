import type { Metadata } from 'next';
import { I18nProviderClient } from '@/locales/client';

export const metadata: Metadata = {
  title: 'FlowVia',
  description: 'Your All-in-One Business Command Center',
};

export default function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>;
}
