import type { Metadata } from 'next';
import { I18nProviderClient } from '@/locales/client';
import { getOptions } from '@/locales/settings';
import { createInstance } from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';

function loadLocaleResource(language: string, namespace: string) {
  // Only load namespaces you actually ship.
  if (namespace !== 'common') return Promise.resolve({ default: {} });

  if (language === 'en') {
    return import('../../../public/locales/en/common.json');
  }
  if (language === 'ru') {
    return import('../../../public/locales/ru/common.json');
  }
  if (language === 'ar') {
    return import('../../../public/locales/ar/common.json');
  }
  if (language === 'uz') {
    return import('../../../public/locales/uz/common.json');
  }

  // fallback
  return import('../../../public/locales/en/common.json');
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  try {
    const i18n = createInstance();

    await i18n
      .use(resourcesToBackend(loadLocaleResource))
      .init(getOptions(params.locale, 'common'));

    return {
      title: i18n.t('appTitle'),
      description: i18n.t('appDescription'),
    };
  } catch {
    // Never break deploy/rollout because of translations.
    return {
      title: 'FlowVia',
      description: 'Your All-in-One Business Command Center',
    };
  }
}

export default function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return <I18nProviderClient locale={locale}>{children}</I18nProviderClient>;
}
