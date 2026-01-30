'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FancyCard } from '@/components/ui/fancy-card';

export default function AdminDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('nav.adminDashboard')}</h1>
      <FancyCard>
        <CardHeader>
          <CardTitle>{t('admin.welcomeAdmin')}</CardTitle>
          <CardDescription>{t('admin.adminDashboardDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{t('admin.adminDashboardContent')}</p>
        </CardContent>
      </FancyCard>
    </div>
  );
}
