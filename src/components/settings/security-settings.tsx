
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { FancyCard } from '../ui/fancy-card';

export default function SecuritySettings() {
    const { t } = useTranslation();
    const { auth, user } = useFirebase();
    const { toast } = useToast();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleUpdatePassword = async () => {
        if (!user) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.userNotAuthenticated') });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.newPasswordsDoNotMatch') });
            return;
        }
        if (newPassword.length < 8) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.passwordMustBeAtLeast8Chars') });
            return;
        }

        setIsSaving(true);
        try {
            if (user.email) {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                toast({ title: t('toast.success.passwordUpdated'), description: t('toast.success.yourPasswordHasBeenSuccessfullyUpdated') });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: error.message });
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <FancyCard>
            <CardHeader>
                <CardTitle>{t('settings.security')}</CardTitle>
                <CardDescription>{t('settings.manageYourPasswordAndSecuritySettings')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="current-password">{t('settings.currentPassword')}</Label>
                    <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="new-password">{t('settings.newPassword')}</Label>
                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('settings.confirmNewPassword')}</Label>
                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isSaving} />
                </div>
            </CardContent>
             <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleUpdatePassword} disabled={isSaving}>
                    {isSaving ? t('settings.updatingPassword') : t('settings.updatePassword')}
                </Button>
            </CardFooter>
        </FancyCard>
    )
}
