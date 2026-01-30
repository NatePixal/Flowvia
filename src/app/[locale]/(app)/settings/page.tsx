
'use client';

import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfileSettings from '@/components/settings/profile-settings';
import CompanySettings from '@/components/settings/company-settings';
import SecuritySettings from '@/components/settings/security-settings';
import PermissionsSettings from '@/components/settings/permissions-settings';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { userProfile } = useFirebase();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('settings.pageTitle')}</h1>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="profile">{t('settings.profile')}</TabsTrigger>
          <TabsTrigger value="company">{t('settings.company')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <ProfileSettings />
        </TabsContent>

        <TabsContent value="company" className="mt-6">
          <div className="space-y-6">
            <CompanySettings />
            {hasPermission(userProfile, 'users', 'view') && <PermissionsSettings />}
          </div>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <SecuritySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
