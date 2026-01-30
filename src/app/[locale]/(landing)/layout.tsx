import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import '@/app/globals.css';
import '@/app/landing.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FlowVia - Business OS',
  description: 'One System for Inventory, Sales & Debts. The All-in-One Command Center for SMEs.',
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght@300..700&display=swap" rel="stylesheet"/>
        <Script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js" strategy="beforeInteractive" />
      </head>
      <body className={`${inter.className} bg-navy-deep text-white`}>
        {children}
      </body>
    </html>
  );
}
