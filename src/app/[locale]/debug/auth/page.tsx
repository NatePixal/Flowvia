
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFirebase } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { IdTokenResult } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// A component to display a piece of data
const DebugInfo = ({ label, value, note }: { label: string; value: any, note?: string }) => (
  <div className="flex flex-col sm:flex-row justify-between sm:items-center p-3 border-b last:border-b-0">
    <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
    <pre className="text-sm font-mono bg-secondary text-secondary-foreground p-1.5 rounded-md mt-2 sm:mt-0">
      {JSON.stringify(value, null, 2)}
    </pre>
  </div>
);

export default function DebugAuthPage() {
  const { t } = useTranslation();
  const { user, auth, sessionReady, companyId, role, userProfile, refreshUserProfile, isUserLoading, firebaseApp, isDeveloper } = useFirebase();
  const [tokenResult, setTokenResult] = useState<IdTokenResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{success: boolean, message: string} | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const { toast } = useToast();
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupResult, setBackupResult] = useState<any>(null);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeResult, setNormalizeResult] = useState<any>(null);

  // UZS Migration State
  const [uzsDetectResult, setUzsDetectResult] = useState<any>(null);
  const [isDetectingUzs, setIsDetectingUzs] = useState(false);
  const [uzsMigrateResult, setUzsMigrateResult] = useState<any>(null);
  const [isMigratingUzs, setIsMigratingUzs] = useState(false);


  const fetchToken = useCallback(async (forceRefresh = false) => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const result = await user.getIdTokenResult(forceRefresh);
      setTokenResult(result);
    } catch (error) {
      console.error("Error fetching ID token:", error);
      setTokenResult(null);
    } finally {
        setIsRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchToken();
    }
  }, [user, fetchToken]);

  const handleForceRefresh = async () => {
      setIsRefreshing(true);
      await fetchToken(true);
      await refreshUserProfile();
      setIsRefreshing(false);
  }

  const runBackup = async () => {
    if (!isDeveloper) {
      toast({ variant: "destructive", title: "Permission Denied", description: "Only developers can run backups."});
      return;
    }
    if (!companyId) {
      toast({ variant: "destructive", title: "Error", description: "Missing companyId."});
      return;
    }

    setIsBackingUp(true);
    setBackupResult(null);
    toast({ title: "Backup Started", description: "Creating backup copies of products, incomingProducts, and sales..." });

    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const fn = httpsCallable(functions, 'createBackup');
        
        const res: any = await fn({ 
            companyId,
            collections: ["products", "incomingProducts", "sales"]
        });

        console.log('[BACKUP RESULT]', res.data);
        setBackupResult(res.data);
        toast({ title: "Backup Finished", description: res.data.message });
    } catch (err: any) {
        console.error('[BACKUP FAILED]', err);
        setBackupResult({ success: false, message: err.message });
        toast({ variant: "destructive", title: "Backup Failed", description: err.message });
    } finally {
        setIsBackingUp(false);
    }
  };

  const runBackfillClaims = async () => {
    if (!auth.currentUser) {
        toast({ variant: "destructive", title: "Not Signed In", description: "Cannot run backfill without an authenticated user."});
        return;
    }
    setIsBackfilling(true);
    setBackfillResult(null);
    
    try {
        // Ensure the developer token is fresh before making the call
        await auth.currentUser.getIdToken(true);

        const functions = getFunctions(firebaseApp, 'us-central1');
        const backfill = httpsCallable(functions, 'backfillClaims');

        console.log("Calling backfillClaims...");
        const result: any = await backfill({});
        const resultData = result.data as { success: boolean, message: string, updated: number, skipped: number };

        console.log('backfillClaims result:', resultData);
        
        toast({ title: "Backfill Complete", description: `Updated ${resultData.updated} users, skipped ${resultData.skipped}.` });
        setBackfillResult({ success: true, message: `Updated ${resultData.updated} users, skipped ${resultData.skipped}.` });

        // After a successful backfill, force a token refresh for the current user (the developer)
        // to ensure their own session reflects any changes if they were also fixed.
        await handleForceRefresh();

    } catch (err: any) {
        console.error('backfillClaims error:', err);
        toast({ variant: "destructive", title: "Backfill Failed", description: err.message });
        setBackfillResult({ success: false, message: err.message });
    } finally {
        setIsBackfilling(false);
    }
  }

  const runNormalizeDates = async (dryRun: boolean) => {
    if (!isDeveloper || !companyId) {
      toast({ variant: "destructive", title: "Permission Denied" });
      return;
    }
    setIsNormalizing(true);
    setNormalizeResult(null);
    toast({ title: "Normalization Started", description: `Running in ${dryRun ? 'dry-run' : 'apply'} mode...` });

    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const fn = httpsCallable(functions, 'normalizeIncomingDates');
      const res: any = await fn({ companyId, dryRun });

      setNormalizeResult(res.data);
      toast({ title: "Normalization Finished", description: `Processed ${res.data.processed} docs. Updated: ${res.data.updated}.` });
    } catch (err: any) {
      setNormalizeResult({ success: false, message: err.message });
      toast({ variant: "destructive", title: "Normalization Failed", description: err.message });
    } finally {
      setIsNormalizing(false);
    }
  };

  const handleDetectUzsFormat = async () => {
    if (!isDeveloper || !companyId) return;
    setIsDetectingUzs(true);
    setUzsDetectResult(null);
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const detectFn = httpsCallable(functions, 'detectUzsDataFormat');
      const res: any = await detectFn({ companyId });
      setUzsDetectResult(res.data);
      toast({ title: "Detection Complete", description: `Result: ${res.data.case}` });
    } catch (err: any) {
      setUzsDetectResult({ case: 'ERROR', reason: err.message });
      toast({ variant: 'destructive', title: "Detection Failed", description: err.message });
    } finally {
      setIsDetectingUzs(false);
    }
  };

  const handleMigrateUzs = async (dryRun: boolean) => {
    if (!isDeveloper || !companyId) return;
    setIsMigratingUzs(true);
    setUzsMigrateResult(null);
    toast({ title: "UZS Migration Started", description: `Mode: ${dryRun ? 'Dry Run' : 'LIVE'}` });
    try {
      const functions = getFunctions(firebaseApp, 'us-central1');
      const migrateFn = httpsCallable(functions, 'migrateUzsToZeroDecimals');
      const res: any = await migrateFn({ companyId, dryRun });
      setUzsMigrateResult(res.data);
      toast({ title: "Migration Finished", description: "See results below." });
    } catch (err: any) {
      setUzsMigrateResult({ success: false, error: err.message });
      toast({ variant: 'destructive', title: "Migration Failed", description: err.message });
    } finally {
      setIsMigratingUzs(false);
    }
  }

  if (isUserLoading || !sessionReady) {
    return (
        <div className="flex h-64 items-center justify-center">
            <p>{t('loadingSessionInfo')}...</p>
        </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">{t('notSignedIn')}</h1>
        <p>{t('pleaseLoginToViewDebugInfo')}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>{t('authenticationDebugPage')}</CardTitle>
          <CardDescription>{t('thisPageShowsTheCurrentStateOfFirebaseAuthentication')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex justify-start">
                <Button onClick={handleForceRefresh} disabled={isRefreshing}>
                    {isRefreshing ? t('refreshing') : t('forceRefreshClaimsAndProfile')}
                </Button>
            </div>
            
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t('rawTokenClaims')}</CardTitle>
                    <CardDescription>{t('theCustomClaimsDirectlyFromTheIDToken')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <DebugInfo label="companyId" value={tokenResult?.claims.companyId ?? 'N/A'} note={t('shouldMatchProviderAndProfile')} />
                    <DebugInfo label="role" value={tokenResult?.claims.role ?? 'N/A'} note={t('determinesUserPermissions')} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t('firebaseProviderContext')}</CardTitle>
                    <CardDescription>{t('theStateManagedByUseFirebaseHook')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <DebugInfo label="sessionReady" value={sessionReady} note={t('isTrueWhenAuthAndProfileAreResolved')} />
                    <DebugInfo label="provider companyId" value={companyId} note={t('takenFromTheTokenClaims')} />
                    <DebugInfo label="provider role" value={role} note={t('takenFromTheTokenClaims')} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{t('userProfileDocument')}</CardTitle>
                    <CardDescription>{t('dataFromTheUsersFirestoreDocument')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <DebugInfo label="userProfile.companyId" value={userProfile?.companyId ?? 'N/A'} note={t('shouldMatchTokenClaims')} />
                    <DebugInfo label="userProfile.role" value={userProfile?.role ?? 'N/A'} note={t('shouldMatchTokenClaims')} />
                    <DebugInfo label="userProfile.uid" value={user?.uid ?? 'N/A'} />
                </CardContent>
            </Card>
        </CardContent>
      </Card>

      {isDeveloper && (
        <Card className="max-w-4xl mx-auto border-amber-500">
            <CardHeader>
                <CardTitle>{t('developerActions')}</CardTitle>
                <CardDescription>{t('runOneTimeScriptsToMaintainTheSystem')}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">

                    <div className="border-t pt-4 space-y-4">
                        <h4 className="font-semibold">UZS Decimal Migration</h4>
                        <p className="text-sm text-muted-foreground mb-2">Tools to fix historical UZS data stored with 2 decimals instead of 0.</p>
                        
                        <div>
                          <Button onClick={handleDetectUzsFormat} disabled={isDetectingUzs}>
                              {isDetectingUzs ? "Detecting..." : "1. Detect UZS Data Format"}
                          </Button>
                          {uzsDetectResult && (
                              <Alert variant={uzsDetectResult.case === 'CASE B' ? 'destructive' : 'default'} className="mt-4">
                                  <AlertTitle>Detection Result: {uzsDetectResult.case}</AlertTitle>
                                  <AlertDescription>
                                      <p>{uzsDetectResult.reason}</p>
                                      {uzsDetectResult.samples?.length > 0 && (
                                        <pre className="mt-2 text-xs whitespace-pre-wrap bg-secondary p-2 rounded-md">{JSON.stringify(uzsDetectResult.samples, null, 2)}</pre>
                                      )}
                                  </AlertDescription>
                              </Alert>
                          )}
                        </div>

                        <div>
                            <p className="text-sm font-medium mb-2">2. Run Migration (Only if detection result is CASE B)</p>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => handleMigrateUzs(true)} disabled={isMigratingUzs}>
                                    {isMigratingUzs ? "Migrating..." : "Run Dry Run"}
                                </Button>
                                <Button variant="destructive" onClick={() => handleMigrateUzs(false)} disabled={isMigratingUzs}>
                                    {isMigratingUzs ? "Migrating..." : "Run LIVE Migration"}
                                </Button>
                            </div>
                            {uzsMigrateResult && (
                              <Alert variant={uzsMigrateResult.success ? 'default' : 'destructive'} className="mt-4">
                                  <AlertTitle>{uzsMigrateResult.success ? 'Migration Complete' : 'Migration Failed'}</AlertTitle>
                                  <AlertDescription>
                                    <pre className="mt-2 text-xs whitespace-pre-wrap bg-secondary p-2 rounded-md">{JSON.stringify(uzsMigrateResult, null, 2)}</pre>
                                  </AlertDescription>
                              </Alert>
                          )}
                        </div>
                    </div>
                    
                    <div className="border-t pt-4">
                        <h4 className="font-semibold">{t('createBackups')}</h4>
                        <p className="text-sm text-muted-foreground mb-4">{t('createBackupsDescription')}</p>
                        {backupResult && (
                            <Alert variant={backupResult.success ? 'default' : 'destructive'} className="mb-4">
                                <AlertTitle>{backupResult.success ? 'Success' : 'Error'}</AlertTitle>
                                <AlertDescription>
                                    <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(backupResult, null, 2)}</pre>
                                </AlertDescription>
                            </Alert>
                        )}
                        <Button variant="outline" onClick={runBackup} disabled={isBackingUp}>
                            {isBackingUp ? t('backingUp') : t('runBackup')}
                        </Button>
                    </div>

                    <div className="border-t pt-4">
                        <h4 className="font-semibold">{t('normalizeDates')}</h4>
                        <p className="text-sm text-muted-foreground mb-4">{t('normalizeDatesDescription')}</p>
                        {normalizeResult && (
                            <Alert variant={normalizeResult.success ? 'default' : 'destructive'} className="mb-4">
                                <AlertTitle>{normalizeResult.success ? 'Success' : 'Error'}</AlertTitle>
                                <AlertDescription>
                                    <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(normalizeResult, null, 2)}</pre>
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="flex gap-2">
                           <Button variant="outline" onClick={() => runNormalizeDates(true)} disabled={isNormalizing}>
                                {isNormalizing ? t('normalizing') : 'Normalize Dates (Dry Run)'}
                           </Button>
                           <Button variant="destructive" onClick={() => runNormalizeDates(false)} disabled={isNormalizing}>
                                {isNormalizing ? t('normalizing') : 'Normalize Dates (Apply)'}
                           </Button>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold">{t('backfillClaimsScript')}</h4>
                        <p className="text-sm text-muted-foreground mb-4">{t('backfillClaimsDescription')}</p>
                        {backfillResult && (
                            <Alert variant={backfillResult.success ? 'default' : 'destructive'} className="mb-4">
                                {backfillResult.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <AlertTitle>{backfillResult.success ? t('success') : t('error')}</AlertTitle>
                                <AlertDescription>{backfillResult.message}</AlertDescription>
                            </Alert>
                        )}
                        <Button variant="outline" onClick={runBackfillClaims} disabled={isBackfilling}>
                            {isBackfilling ? t('backfilling') : t('runBackfillClaimsScript')}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
