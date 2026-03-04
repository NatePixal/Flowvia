'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Register service worker for basic offline shell caching.
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // non-fatal
    });
  }, []);

  return null;
}
