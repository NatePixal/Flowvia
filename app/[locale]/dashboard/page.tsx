
'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFirebase } from '@/firebase';

export default function DashboardPage() {
  const { t } = useTranslation();
  const { userProfile } = useFirebase();

  return (
    <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold tracking-tight">
                {t('welcomeBack')}, {userProfile?.name}!
            </h1>
        </div>
        
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>{t('gettingStarted')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{t('welcomeToTradeFlowDashboard')}</p>
                    <p className="mt-2 text-muted-foreground">{t('chartsTemporarilyUnavailable')}</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>{t('nextSteps')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{t('exploreTheAppSections')}</p>
                </CardContent>
            </Card>
        </div>
    </div>
  );
}
