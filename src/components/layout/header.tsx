'use client';

import { useMemo } from 'react';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Building2,
  ChevronDown,
  Globe,
  Layers,
  Search,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useFirebase, useDoc } from '@/firebase';
import { useCurrency } from '@/lib/currency-provider';
import type { Currency } from '@/lib/types';
import { cn, getInitials } from '@/lib/utils';
import { ThemeToggle } from './theme-toggle';

type SubscriptionTone = 'active' | 'trial' | 'past_due' | 'blocked' | 'inactive';
type LedgerTone = 'verified' | 'needs_audit' | 'repair_required' | 'unknown';

function getSubscriptionTone(company: Record<string, any> | null | undefined): { label: string; tone: SubscriptionTone } {
  if (!company) return { label: 'Loading', tone: 'inactive' };
  if (company.administrativeLock === true || company.subscriptionAccessLocked === true) {
    return { label: 'Blocked', tone: 'blocked' };
  }
  const status = String(company.subscriptionStatus || (company.isPaid ? 'active' : 'inactive'));
  if (status === 'active') return { label: 'Active', tone: 'active' };
  if (status === 'trialing') return { label: 'Trial', tone: 'trial' };
  if (status === 'past_due' || status === 'unpaid') return { label: 'Past due', tone: 'past_due' };
  if (status === 'canceled' || status === 'expired' || status === 'blocked') return { label: 'Blocked', tone: 'blocked' };
  return { label: 'Inactive', tone: 'inactive' };
}

function getLedgerTone(status: unknown): { label: string; tone: LedgerTone } {
  if (status === 'verified') return { label: 'Verified', tone: 'verified' };
  if (status === 'needs_audit') return { label: 'Needs audit', tone: 'needs_audit' };
  if (status === 'repair_required') return { label: 'Repair required', tone: 'repair_required' };
  return { label: 'Unknown', tone: 'unknown' };
}

function statusClasses(tone: SubscriptionTone | LedgerTone) {
  return cn(
    'gap-1 border font-medium',
    tone === 'active' || tone === 'verified'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : tone === 'trial' || tone === 'needs_audit'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        : tone === 'past_due' || tone === 'repair_required' || tone === 'blocked'
          ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
          : 'border-slate-400/30 bg-slate-500/10 text-slate-600 dark:text-slate-300'
  );
}

export default function Header() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const {
    auth,
    user,
    userProfile,
    company,
    companyId,
    firestore,
    refreshUserProfile,
    isUserLoading,
  } = useFirebase();
  const { currency, setCurrency } = useCurrency();

  const analyticsRef = useMemo(
    () => (firestore && companyId ? doc(firestore, 'companies', companyId, 'analytics', 'current') : null),
    [firestore, companyId]
  );
  const { data: analytics } = useDoc<Record<string, any>>(analyticsRef);

  const locale = pathname.split('/')[1] || 'en';
  const companyName = company?.name || (isUserLoading ? '' : 'No company scope');
  const userRole = userProfile?.role || (companyId ? 'member' : 'system');
  const subscription = getSubscriptionTone(company);
  const ledger = getLedgerTone(analytics?.auditStatus || company?.ledgerAuditStatus);

  const changeLanguage = async (lng: string) => {
    i18n.changeLanguage(lng);
    const segments = pathname.split('/');
    segments[1] = lng;
    router.push(segments.join('/'));
    if (!user || !firestore) return;
    await updateDoc(doc(firestore, 'users', user.uid), { language: lng });
    await refreshUserProfile();
  };

  const handleSignOut = async () => {
    if (auth) await signOut(auth);
  };

  const handleCurrencyChange = async (value: string) => {
    const newCurrency = value as Currency;
    setCurrency(newCurrency);
    if (!user || !firestore) return;
    await updateDoc(doc(firestore, 'users', user.uid), { currency: newCurrency });
    await refreshUserProfile();
  };

  const goToSettings = () => {
    router.push(`/${locale}/settings`);
  };

  return (
    <header className="sticky top-0 z-30 border-b border-flowvia-border-light/80 bg-background/92 px-3 backdrop-blur-xl dark:border-flowvia-border-dark/80 dark:bg-flowvia-canvas-dark/88 md:px-5">
      <div className="flex h-16 items-center gap-3">
        {isMobile && <SidebarTrigger />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-11 min-w-0 justify-start gap-3 rounded-card border border-flowvia-border-light/70 bg-white/70 px-3 shadow-sm hover:bg-white dark:border-flowvia-border-dark dark:bg-flowvia-panel-navy/80 dark:hover:bg-flowvia-panel-navy"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-card bg-flowvia-primary-soft text-flowvia-primary-deep dark:bg-flowvia-primary/15 dark:text-flowvia-primary">
                <Building2 className="size-4" />
              </span>
              <span className="hidden min-w-0 text-left sm:block">
                {isUserLoading ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  <>
                    <span className="block truncate text-sm font-semibold text-foreground">{companyName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{userRole}</span>
                  </>
                )}
              </span>
              <ChevronDown className="hidden size-4 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 animate-dropdown-reveal">
            <DropdownMenuLabel className="flex items-center gap-2">
              <Layers className="size-4 text-flowvia-primary" />
              Workspace
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-2">
              <p className="truncate text-sm font-semibold">{companyName}</p>
              <p className="truncate text-xs text-muted-foreground">{companyId || 'System administration'}</p>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative hidden flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search"
            placeholder={t('placeholder.search')}
            className="h-10 max-w-md rounded-card border-flowvia-border-light/80 bg-flowvia-canvas-light pl-9 shadow-inner dark:border-flowvia-border-dark dark:bg-flowvia-panel-ink"
          />
        </div>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Badge variant="outline" className={statusClasses(subscription.tone)}>
            <ShieldCheck className="size-3.5" />
            {subscription.label}
          </Badge>
          <Badge variant="outline" className={statusClasses(ledger.tone)}>
            <Layers className="size-3.5" />
            {ledger.label}
          </Badge>
        </div>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="hidden h-10 rounded-card px-3 financial-nums sm:inline-flex">
              {currency}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t('label.currency')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={currency} onValueChange={handleCurrencyChange}>
              {(['USD', 'AED', 'SAR', 'JOD', 'EGP', 'UZS', 'CNY'] as Currency[]).map((item) => (
                <DropdownMenuRadioItem key={item} value={item}>{item}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-card">
              <Globe className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => changeLanguage('en')}>English</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeLanguage('ru')}>Russian</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeLanguage('ar')}>Arabic</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeLanguage('uz')}>Uzbek</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="hidden rounded-card sm:inline-flex" aria-label="Notifications">
          <Bell className="size-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 rounded-card px-2">
              <Avatar className="size-8">
                <AvatarImage src={userProfile?.photoURL ?? undefined} alt={userProfile?.name || user?.email || ''} />
                <AvatarFallback>
                  {getInitials(userProfile?.name || user?.email) || <UserIcon className="size-4" />}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 animate-dropdown-reveal">
            <DropdownMenuLabel>
              <span className="block truncate">{userProfile?.name || user?.email || t('misc.user')}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{userRole}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={goToSettings}>{t('nav.settings')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>{t('auth.logout')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
