'use client';

import Script from 'next/script';

export function GoogleAnalytics() {
  // IMPORTANT: Replace this with your actual GA4 Measurement ID
  const measurementId = 'G-XXXXXXXXXX'; 

  // Don't render the script if no ID is provided or in non-production environments
  if (process.env.NODE_ENV !== 'production' || measurementId === 'G-XXXXXXXXXX') {
    return null;
  }

  return (
    <>
      <Script
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      />
      <Script
        id="ga-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${measurementId}', {
              page_path: window.location.pathname,
            });
          `,
        }}
      />
    </>
  );
}
