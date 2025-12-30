
'use client';

import { useFirebase } from '@/firebase/provider';
import AppSidebar from '@/components/layout/app-sidebar';
import Header from '@/components/layout/header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Loader2, ShieldAlert } from 'lucide-react';
import { usePathname, redirect } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { useTranslation } from 'react-i18next';


function BlockedScreen() {
    const { t } = useTranslation();
    const { auth } = useFirebase();
    const handleLogout = () => {
        if (auth) {
            auth.signOut();
        }
    };
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-background gap-4">
            <ShieldAlert className="h-16 w-16 text-destructive" />
            <div className="text-center">
                <h1 className="text-2xl font-bold">{t('accountAccessRestricted')}</h1>
                <p className="text-muted-foreground">{t('yourAccountHasBeenBlockedOrSubscriptionEnded')}</p>
                <p className="text-muted-foreground">{t('pleaseContactSupportForAssistance')}</p>
            </div>
            <Button onClick={handleLogout}>{t('logout')}</Button>
        </div>
    );
}

// This is the main export. It wraps the entire authenticated app with necessary providers.
export default function AppShell({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const { user, userProfile, isUserLoading } = useFirebase();
    const pathname = usePathname();
    const locale = pathname.split('/')[1] || 'en';

    useEffect(() => {
        if (!isUserLoading && !user) {
            redirect(`/${locale}/login`);
        }
    }, [isUserLoading, user, locale]);

    const isAccountActive = useMemo(() => {
        if (!userProfile) return false;
        if (userProfile.role === 'developer') return true; // Developers always have access
        return userProfile.status === 'active' && userProfile.isPaid === true;
    }, [userProfile]);
    
    // This derived state checks if we are ready to render child components.
    // It now waits for BOTH user and userProfile to be available.
    const isReadyToRender = !isUserLoading && user && userProfile;


    // Show a global loading spinner until we have a user AND their profile.
    if (!isReadyToRender) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    // If the user is loaded but their account is not active, show the blocked screen.
    // Allow access to settings and admin pages for developers even if account is not active.
    if (!isAccountActive) {
      const allowedPaths = [`/${locale}/settings`, `/${locale}/admin/dashboard`, `/${locale}/admin/migrate`];
      if (!allowedPaths.some(p => pathname.startsWith(p))) {
        return <BlockedScreen />;
      }
    }

    // Once ready, render the full application shell and its children.
    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full">
                <AppSidebar />
                <div className="flex flex-1 flex-col">
                    <Header />
                    <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
                </div>
            </div>
            <Toaster />
        </SidebarProvider>
    );
}
