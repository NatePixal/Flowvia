'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FirebaseClientProvider, useFirebase } from '@/firebase';
import { Toaster } from '@/components/ui/toaster';
import SuperAdminControlPanel from '@/components/super-admin/SuperAdminControlPanel';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';

function SuperAdminGate({ locale }: { locale: string }) {
  const router = useRouter();
  const { user, sessionReady, isUserLoading, isSystemAdmin, missingCompanyMembership, refreshUserProfile } = useFirebase();

  useEffect(() => {
    if (!sessionReady || isUserLoading) return;
    if (!user) router.replace(`/${locale}/login`);
  }, [user, sessionReady, isUserLoading, router, locale]);

  if (!sessionReady || isUserLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f19] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 size-12 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
          <p className="text-sm text-slate-300">Loading system admin session...</p>
        </div>
      </div>
    );
  }

  if (!isSystemAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border bg-card p-8 text-center shadow-editorialLight">
          <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">System admin access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This route is separate from company workspaces and requires a document at /systemAdmins/{user.uid}.
          </p>
          {missingCompanyMembership && (
            <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              Your profile has a companyId, but company membership is missing. A system admin must run the backfill before tenant access works.
            </p>
          )}
          <Button className="mt-5" onClick={refreshUserProfile}>Refresh access</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SuperAdminControlPanel />
      <Toaster />
    </>
  );
}

export default function SuperAdminPage({ params }: { params: { locale: string } }) {
  return (
    <FirebaseClientProvider>
      <SuperAdminGate locale={params.locale} />
    </FirebaseClientProvider>
  );
}
