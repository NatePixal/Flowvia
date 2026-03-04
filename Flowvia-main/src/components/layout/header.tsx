'use client';

import { Search, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import { useRouter, usePathname } from 'next/navigation';
import { useFirebase } from '@/firebase/provider';
import { signOut } from 'firebase/auth';
import { useCurrency } from '@/lib/currency-provider';
import type { Currency } from '@/lib/types';
import { ThemeToggle } from './theme-toggle';
import { doc, updateDoc } from 'firebase/firestore';
import { User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { getInitials } from '@/lib/utils';


export default function Header() {
  const { t, i18n } = useTranslation();
  const { isMobile } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const { auth, user, userProfile, firestore, refreshUserProfile } = useFirebase();
  const { currency, setCurrency } = useCurrency();

  const changeLanguage = async (lng: string) => {
    // Optimistically update UI
    i18n.changeLanguage(lng);
    
    // Update URL
    const segments = pathname.split('/');
    segments[1] = lng;
    router.push(segments.join('/'));

    // Persist preference to user profile in Firestore
    if (user && firestore) {
        try {
            const userRef = doc(firestore, 'users', user.uid);
            await updateDoc(userRef, { language: lng });
            await refreshUserProfile(); // ensures provider state is in sync
        } catch (error) {
            console.error('Failed to save language preference:', error);
        }
    }
  };

  const handleSignOut = async () => {
    if (auth) {
      await signOut(auth);
    }
  };
  
  const handleCurrencyChange = async (value: string) => {
    const newCurrency = value as Currency;
    setCurrency(newCurrency);

    if (!user || !firestore) return;

    try {
      const userRef = doc(firestore, 'users', user.uid);
      await updateDoc(userRef, { currency: newCurrency });
      await refreshUserProfile();
    } catch (error) {
      console.error('Failed to save currency preference:', error);
    }
  };
  
  const goToSettings = () => {
      const locale = pathname.split('/')[1] || 'en';
      router.push(`/${locale}/settings`);
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-card px-4 md:px-6">
      {isMobile && <SidebarTrigger />}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('placeholder.search')}
          className="w-full max-w-sm bg-background pl-9"
        />
      </div>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-full w-20">
            {currency}
            <span className="sr-only">{t('misc.changeCurrency')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('label.currency')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={currency} onValueChange={handleCurrencyChange}>
            <DropdownMenuRadioItem value="USD">USD</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="AED">AED</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="SAR">SAR</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="JOD">JOD</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="EGP">EGP</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="UZS">UZS</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="CNY">CNY</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Globe className="h-5 w-5" />
            <span className="sr-only">{t('misc.changeLanguage')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => changeLanguage('en')}>
            English
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => changeLanguage('ru')}>
            Русский
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => changeLanguage('ar')}>
            العربية
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => changeLanguage('uz')}>
            O'zbek
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
                <AvatarImage src={userProfile?.photoURL ?? undefined} alt={userProfile?.name} />
                <AvatarFallback>{getInitials(userProfile?.name)}</AvatarFallback>
            </Avatar>
            <span className="sr-only">{t('misc.openMenu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{userProfile?.name || user?.email || t('misc.user')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={goToSettings}>
            <span>{t('nav.settings')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <span>{t('auth.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

