// src/i18n/settings.ts
export const fallbackLng = 'en' as const;

export const locales = ['en', 'ru', 'ar', 'uz'] as const;
export type AppLocale = (typeof locales)[number];

export const defaultNS = 'common';

export function getOptions(lng: string = fallbackLng, ns: string | string[] = defaultNS) {
  return {
    debug: process.env.NODE_ENV === 'development',
    supportedLngs: locales,
    fallbackLng,
    lng,
    fallbackNS: defaultNS,
    defaultNS,
    ns,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  };
}
