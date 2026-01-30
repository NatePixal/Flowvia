// src/app/page.tsx
import { redirect } from 'next/navigation';
import { fallbackLng } from '../locales/settings';

export default function RootPage() {
  // This page now redirects to the new public landing page.
  redirect(`/${fallbackLng}`);
}
