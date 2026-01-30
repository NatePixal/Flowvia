
'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Code } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';

export default function DataMigrationPage() {
  const { t } = useTranslation();
  const { userProfile, isDeveloper } = useFirebase();

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
        <CardContent>
          <p>{t('admin.developerToolsWarning')}</p>
          <div className="mt-4 flex gap-4">
            <Button variant="outline">{t('admin.runDryRun')}</Button>
             <Button variant="destructive">{t('admin.runMigration')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
