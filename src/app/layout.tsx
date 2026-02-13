// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { CurrencyProvider } from '@/lib/currency-provider';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { GoogleAnalytics } from '@/components/analytics/google-analytics';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FlowVia',
  description: 'Your All-in-One Business Command Center',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth" suppressHydrationWarning>
       <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@300..700&display=swap" rel="stylesheet"/>
        {/* The three.js script was removed as it was unused and negatively impacted performance. */}
      </head>
      <body className={`${inter.className} antialiased`}>
        <GoogleAnalytics />
        <FirebaseClientProvider>
          <CurrencyProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              {children}
            </ThemeProvider>
          </CurrencyProvider>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
