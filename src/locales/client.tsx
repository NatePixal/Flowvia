'use client';

import { I18nextProvider } from 'react-i18next';
import { createInstance, type i18n as I18nInstance } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOptions, locales, fallbackLng } from './settings';
import { useFirebase } from '@/firebase/provider';

// Keep your existing static imports:
import enTranslations from '../../public/locales/en/common.json';
import ruTranslations from '../../public/locales/ru/common.json';

// NEW: add these two files (contents below)
import arTranslations from '../../public/locales/ar/common.json';
import uzTranslations from '../../public/locales/uz/common.json';

const resources = {
  en: { common: enTranslations },
  ru: { common: ruTranslations },
  ar: { common: arTranslations },
  uz: { common: uzTranslations },
} as const;

function setDocumentDirAndLang(lng: string) {
  const isRTL = lng === 'ar';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng;
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
  }
}

async function initI18nextOnce(initialLng: string): Promise<I18nInstance> {
  const i18n = createInstance();

  await i18n
    .use(LanguageDetector)
    .init({
      ...getOptions(initialLng, getOptions().ns),
      resources,
      detection: {
        // Primary: user choice in localStorage
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'flowvia_lang',
      },
    });

  setDocumentDirAndLang(i18n.language);

  i18n.on('languageChanged', (lng) => {
    setDocumentDirAndLang(lng);
    try {
      localStorage.setItem('flowvia_lang', lng);
    } catch {}
  });

  return i18n;
}

export function I18nProviderClient({
  children,
  locale: initialLocale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const { userProfile } = useFirebase();

  const preferredLocale = useMemo(() => {
    // Priority:
    // 1) localStorage (user picker)
    // 2) user profile language
    // 3) route locale
    // 4) fallback
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('flowvia_lang');
      if (stored && (locales as readonly string[]).includes(stored)) return stored;
    }
    if (userProfile?.language && (locales as readonly string[]).includes(userProfile.language)) {
      return userProfile.language;
    }
    if ((locales as readonly string[]).includes(initialLocale)) return initialLocale;
    return fallbackLng;
  }, [userProfile?.language, initialLocale]);

  const i18nRef = useRef<I18nInstance | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!i18nRef.current) {
        i18nRef.current = await initI18nextOnce(preferredLocale);
        if (!mounted) return;
        setReady(true);
        return;
      }

      // If already initialized, just switch language
      if (i18nRef.current.language !== preferredLocale) {
        await i18nRef.current.changeLanguage(preferredLocale);
      }

      if (mounted) setReady(true);
    })();

    return () => {
      mounted = false;
    };
  }, [preferredLocale]);

  if (!ready || !i18nRef.current) return null;

  return <I18nextProvider i18n={i18nRef.current}>{children}</I18nextProvider>;
}
