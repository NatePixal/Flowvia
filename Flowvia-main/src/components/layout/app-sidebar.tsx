'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Building, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasPermission } from '@/lib/permissions';
import { useFirebase } from '@/firebase/provider';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import type { Location } from '@/lib/types';
import { APP_ROUTES, ADMIN_ROUTES } from '@/lib/routes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { signOut } from 'firebase/auth';
import { Button } from '../ui/button';

export default function AppSidebar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { userProfile, auth, locationsEnabled } = useFirebase();

  const handleSignOut = () => {
    if (auth) {
      signOut(auth);
    }
  };
  
  const locale = pathname.split('/')[1] || 'en';

  const { data: locations } = useCompanyCollection<Location>('locations');

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Building className="size-5" />
          <span className="text-lg font-semibold">{t('appTitle')}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarGroup>
            <SidebarGroupLabel>{t('nav.navigation')}</SidebarGroupLabel>
            {Object.values(APP_ROUTES).map(route => (
              hasPermission(userProfile, route.module as any, route.action as any) && (
                <SidebarMenuItem key={route.href}>
                  <Link href={`/${locale}${route.href}`} passHref>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(`/${locale}${route.href}`)}
                      tooltip={t(route.label)}
                    >
                      <route.icon />
                      <span>{t(route.label)}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              )
            ))}
          </SidebarGroup>

          {locationsEnabled && hasPermission(userProfile, 'shops', 'view') && (
            <>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupLabel>{t('nav.shopsGroup')}</SidebarGroupLabel>
                <SidebarMenuItem>
                  <Link href={`/${locale}/shops`} passHref>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(`/${locale}/shops`)}
                      tooltip={t('nav.shops')}
                    >
                      <Building className="size-4" />
                      <span>{t('nav.shops')}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>

                {(locations || []).filter(l => l.active !== false).map((loc) => (
                  <SidebarMenuItem key={loc.id}>
                    <Link href={`/${locale}/shops/${loc.id}`} passHref>
                      <SidebarMenuButton
                        isActive={pathname.startsWith(`/${locale}/shops/${loc.id}`)}
                        tooltip={loc.name}
                        size="sm"
                      >
                        <span className="ml-6 truncate">{loc.name}</span>
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                ))}
              </SidebarGroup>
            </>
          )}


          {(hasPermission(userProfile, 'admin', 'view')) && (
            <>
            <SidebarSeparator />
            <SidebarGroup>
                <SidebarGroupLabel>{t('nav.administration')}</SidebarGroupLabel>
                {Object.values(ADMIN_ROUTES).map(route => {
                  // Hide the Admin Dashboard for admins, as it's not useful for them.
                  // It remains for developers who have other tools on that page.
                  if (userProfile?.role === 'admin' && route.href === '/admin/dashboard') {
                    return null;
                  }

                  return hasPermission(userProfile, route.module as any, route.action as any) && (
                    <SidebarMenuItem key={route.href}>
                       <Link href={`/${locale}${route.href}`} passHref>
                        <SidebarMenuButton
                          isActive={pathname.startsWith(`/${locale}${route.href}`)}
                          tooltip={t(route.label)}
                        >
                          <route.icon />
                          <span>{t(route.label)}</span>
                        </SidebarMenuButton>
                      </Link>
                    </SidebarMenuItem>
                  )
                })}
            </SidebarGroup>
            </>
          )}

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
            <SidebarMenuItem>
                 <Link href={`/${locale}/settings`} passHref>
                    <SidebarMenuButton
                        isActive={pathname.startsWith(`/${locale}/settings`)}
                        tooltip={t('nav.settings')}
                        variant="outline"
                      >
                        <Avatar className="size-6">
                            <AvatarImage src={userProfile?.photoURL ?? undefined} />
                            <AvatarFallback className="text-xs">
                              {getInitials(userProfile?.name)}
                            </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{userProfile?.name ?? t('misc.user')}</span>
                    </SidebarMenuButton>
                 </Link>
            </SidebarMenuItem>
             <SidebarMenuItem>
                <Button variant="ghost" onClick={handleSignOut} className="w-full justify-start gap-2">
                    <LogOut />
                    <span>{t('auth.logout')}</span>
                </Button>
            </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

    