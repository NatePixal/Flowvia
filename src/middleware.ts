import { NextRequest, NextResponse } from 'next/server';

const locales = ["en", "ru", "ar", "uz"] as const;
type Locale = (typeof locales)[number];

const isLocale = (v: string): v is Locale =>
  (locales as readonly string[]).includes(v);

const fallbackLng: Locale = "en";

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

const COOKIE_NAME = 'NEXT_LOCALE';

export function middleware(request: NextRequest) {
  // 1. WWW to Apex domain redirection
  const host = request.headers.get("host") || "";
  if (host.toLowerCase().startsWith("www.")) {
    const newHost = host.replace("www.", "");
    const newUrl = new URL(request.url);
    newUrl.host = newHost;
    const response = NextResponse.redirect(newUrl, 308); // 308 is a permanent redirect
    // Apply HSTS header to redirect response
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    return response;
  }

  // 2. Locale Redirection
  const { pathname } = request.nextUrl;
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    const response = NextResponse.next();
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    return response;
  }

  // If no locale, redirect to the preferred or fallback locale.
  const preferredLocale = request.cookies.get(COOKIE_NAME)?.value;
  const localeToUse: Locale =
    preferredLocale && isLocale(preferredLocale) ? preferredLocale : fallbackLng;

  const newUrl = new URL(`/${localeToUse}${pathname}`, request.url);
  const response = NextResponse.redirect(newUrl);
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  return response;
}
