
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, KeyRound, Building2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import ProfileSettings from '@/components/settings/profile-settings';
import SecuritySettings from '@/components/settings/security-settings';
import CompanySettings from '@/components/settings/company-settings';
import PermissionsSettings from '@/components/settings/permissions-settings';
import { useFirebase } from '@/firebase';

type Section = 'profile' | 'security' | 'company' | 'permissions';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useFirebase(); // Assuming useFirebase gives role info
  const [activeSection, setActiveSection] = useState<Section>('profile');
  
  // This is a placeholder. In a real app, you'd get the user's role from your user object.
  const userRole = 'admin'; // or 'member'

  const navItems = [
    { id: 'profile', label: t('Profile'), icon: User },
    { id: 'security', label: t('Security'), icon: KeyRound },
    ...(userRole === 'admin' ? [{ id: 'company', label: t('Company'), icon: Building2 }] : []),
    ...(userRole === 'admin' ? [{ id: 'permissions', label: t('Permissions'), icon: ShieldCheck }] : []),
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'profile':
        return <ProfileSettings />;
      case 'security':
        return <SecuritySettings />;
      case 'company':
        return userRole === 'admin' ? <CompanySettings /> : null;
      case 'permissions':
        return userRole === 'admin' ? <PermissionsSettings /> : null;
      default:
        return <ProfileSettings />;
    }
  };

  return (
    <div className="flex flex-col gap-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('Settings')}</h1>
            <p className="text-muted-foreground">{t('Manage Your Account And Company Settings')}</p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            <aside className="md:col-span-1">
                <nav className="flex flex-col space-y-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id as Section)}
                        className={cn(
                            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-left',
                            'transition-colors duration-150',
                            activeSection === item.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        )}
                        >
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                    </button>
                ))}
                </nav>
            </aside>
            <main className="md:col-span-3">
                {renderSection()}
            </main>
        </div>
    </div>
  );
}
