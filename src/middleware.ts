import { NextRequest, NextResponse } from 'next/server';
import { locales, fallbackLng } from './locales/settings';

export const config = {
  // This matcher prevents the middleware from running on static files and API routes.
  matcher: ['/((?!_next|api|static|.*\\..*).*)'],
};

const PUBLIC_FILE = /\.(.*)$/;
const COOKIE_NAME = 'NEXT_LOCALE';

export function middleware(request: NextRequest) {
  // 1. WWW to Apex domain redirection
  const host = request.headers.get("host") || "";
  if (host.toLowerCase() === "www.flowvia.live") {
    const targetUrl = new URL(request.url);
    targetUrl.host = "flowvia.live";
    return NextResponse.redirect(targetUrl, 308); // 308 is a permanent redirect
  }

  // 2. Locale Redirection
  const { pathname } = request.nextUrl;

  // Check if the path is for a static file, which the matcher should already handle but is good for safety.
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/static') ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Check if the pathname already has a locale prefix.
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) {
    return NextResponse.next();
  }

  // If no locale, redirect to the preferred or fallback locale.
  const preferredLocale = request.cookies.get(COOKIE_NAME)?.value;
  const localeToUse = preferredLocale && locales.includes(preferredLocale) ? preferredLocale : fallbackLng;

  request.nextUrl.pathname = `/${localeToUse}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}
