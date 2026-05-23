import type { Metadata } from 'next';
import { I18nProviderClient } from '@/locales/client';
import { locales } from '@/locales/settings';

const title = 'FlowVia: All-In-One Business Command Center | ERP & Inventory Management';
const description =
  'Maximize your business efficiency with FlowVia, the all-in-one command center. Seamlessly manage inventory, sales, expenses, and client loans with our powerful, role-based ERP solution. Get started today!';
const domain = 'https://flowvia.live';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const canonicalUrl = `${domain}/${locale}`;
  return {
    title,
    description,
    keywords: ['ERP', 'business management', 'inventory control', 'sales tracking', 'expense management', 'SME software', 'flowvia'],
    alternates: {
      canonical: canonicalUrl,
      languages: {
        'en': `${domain}/en`,
        'ru': `${domain}/ru`,
        'ar': `${domain}/ar`,
        'uz': `${domain}/uz`,
        'x-default': `${domain}/en`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'FlowVia',
      type: 'website',
      images: [
        {
          url: `${domain}/og-image.png`, // Recommended: Create this image (1200x630) and place in /public
          width: 1200,
          height: 630,
          alt: 'A preview of the FlowVia application dashboard showing charts and stats.',
        },
      ],
      locale: locale,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${domain}/twitter-image.png`], // Recommended: Create this image (e.g., 1200x675) and place in /public
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    icons: {
      icon: '/favicon.ico',
      apple: '/apple-touch-icon.png', // Recommended: Add these images to /public
    },
    manifest: undefined, // Declared in root layout to avoid /en/site.webmanifest path issue
  };
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'FlowVia',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: description,
  offers: {
    '@type': 'Offer',
    price: '0', // Or your starting price
    priceCurrency: 'USD',
  },
};


export default function LocaleLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  return (
    <I18nProviderClient locale={locale}>
      <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </I18nProviderClient>
  );
}
