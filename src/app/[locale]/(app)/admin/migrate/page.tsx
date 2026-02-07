'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Code, Users, Loader2, DatabaseZap } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export default function DataMigrationPage() {
  const { t } = useTranslation();
  const { userProfile, firebaseApp } = useFirebase();
  const { toast } = useToast();

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<any>(null);
  
  const [isBackfillingDates, setIsBackfillingDates] = useState(false);
  const [backfillDatesResult, setBackfillDatesResult] = useState<any>(null);

  if (!hasPermission(userProfile, 'developer', 'view')) {
    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold">{t('nav.dataMigration')}</h1>
             <Alert variant="destructive">
                <AlertTitle>{t('toast.error.accessDenied')}</AlertTitle>
                <AlertDescription>{t('admin.developerAccessOnly')}</AlertDescription>
            </Alert>
        </div>
    )
  }
  
  const handleRecalculateBalances = async (dryRun: boolean) => {
    // This logic would also need to be updated for developers if used app-wide.
    // For now, we focus on the business date backfill.
    if (!userProfile?.companyId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
      return;
    }
    
    setIsRecalculating(true);
    setRecalcResult(null);

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const recalculateFn = httpsCallable(functions, 'recalculateAllClientBalances');
      const res: any = await recalculateFn({ companyId: userProfile.companyId, dryRun });
      setRecalcResult(res.data);
      toast({
        title: t('toast.success.recalculationComplete'),
        description: `${dryRun ? t('admin.dryRun') : t('admin.applyMode')} finished.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: t('toast.error.title'), description: err.message });
      setRecalcResult({ success: false, logs: [err.message] });
    } finally {
      setIsRecalculating(false);
    }
  }

  const handleBackfillDates = async (dryRun: boolean) => {
    setIsBackfillingDates(true);
    setBackfillDatesResult(null);
    toast({ title: t('admin.backfillStarted') as string, description: `${t('admin.mode')}: ${dryRun ? t('admin.dryRun') : 'LIVE'}` });

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const backfillFn = httpsCallable(functions, 'backfillBusinessDates');
      // No longer needs companyId, it will run for all companies.
      const res: any = await backfillFn({ dryRun });
      setBackfillDatesResult(res.data);
      toast({
        title: t('admin.backfillComplete') as string,
        description: `Processed ${res.data.companiesProcessed} companies.`,
      });
    } catch (err: any) {
      console.error(err);
      toast({ variant: 'destructive', title: t('toast.error.title'), description: err.message });
      setBackfillDatesResult({ success: false, logs: [err.message] });
    } finally {
      setIsBackfillingDates(false);
    }
  }


  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('nav.dataMigration')}</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code /> {t('admin.developerTools')}
          </CardTitle>
          <CardDescription>{t('admin.developerToolsDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">{t('admin.developerToolsWarning')}</p>
          
          <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                 <div className="flex-shrink-0 rounded-full bg-primary/10 p-2 text-primary"><Users className="h-5 w-5" /></div>
                 <div>
                    <h3 className="font-semibold">{t('admin.recalculateAllClientBalances')}</h3>
                    <p className="text-sm text-muted-foreground">{t('admin.recalculateAllClientBalancesDescription')}</p>
                 </div>
              </div>
              
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => handleRecalculateBalances(true)} disabled={isRecalculating}>
                  {isRecalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('admin.runDryRun')}
                </Button>
                 <Button variant="destructive" onClick={() => handleRecalculateBalances(false)} disabled={isRecalculating}>
                  {isRecalculating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('admin.runMigration')}
                 </Button>
              </div>
              
              {recalcResult && (
                <div className="mt-4 rounded-md bg-secondary p-4 text-secondary-foreground">
                    <h4 className="font-semibold">{t('admin.results')}</h4>
                    <pre className="mt-2 whitespace-pre-wrap text-xs font-mono max-h-60 overflow-auto">
                        {`Success: ${recalcResult.success}\nDry Run: ${recalcResult.dryRun}\nProcessed: ${recalcResult.clientsProcessed}\nTo Update: ${recalcResult.clientsForUpdate}\n\nLogs:\n${(recalcResult.logs || []).join('\n')}`}
                    </pre>
                </div>
              )}
          </div>

          <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center gap-3">
                 <div className="flex-shrink-0 rounded-full bg-primary/10 p-2 text-primary"><DatabaseZap className="h-5 w-5" /></div>
                 <div>
                    <h3 className="font-semibold">{t('admin.backfillBusinessDates')}</h3>
                    <p className="text-sm text-muted-foreground">{t('admin.backfillBusinessDatesDescriptionAppWide')}</p>
                 </div>
              </div>
              
              <div className="flex gap-4">
                <Button variant="outline" onClick={() => handleBackfillDates(true)} disabled={isBackfillingDates}>
                  {isBackfillingDates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('admin.runDryRun')}
                </Button>
                 <Button variant="destructive" onClick={() => handleBackfillDates(false)} disabled={isBackfillingDates}>
                  {isBackfillingDates && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('admin.runMigration')}
                 </Button>
              </div>
              
              {backfillDatesResult && (
                <div className="mt-4 rounded-md bg-secondary p-4 text-secondary-foreground">
                    <h4 className="font-semibold">{t('admin.results')}</h4>
                    <pre className="mt-2 whitespace-pre-wrap text-xs font-mono max-h-60 overflow-auto">
                        {JSON.stringify(backfillDatesResult, null, 2)}
                    </pre>
                </div>
              )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
