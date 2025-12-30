
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
            toast({ variant: 'destructive', title: t('Error'), description: t('User not authenticated.') });
            return;
        }
        if (newPassword !== confirmPassword) {
            toast({ variant: 'destructive', title: t('Error'), description: t('New passwords do not match.') });
            return;
        }
        if (newPassword.length < 8) {
            toast({ variant: 'destructive', title: t('Error'), description: t('Password must be at least 8 characters long.') });
            return;
        }

        setIsSaving(true);
        try {
            if (user.email) {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);
                toast({ title: t('Password Updated'), description: t('Your password has been successfully updated.') });
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
            }
        } catch (error: any) {
            toast({ variant: 'destructive', title: t('Error'), description: error.message });
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Security')}</CardTitle>
                <CardDescription>{t('Manage your password and security settings.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="current-password">{t('Current Password')}</Label>
                    <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="new-password">{t('New Password')}</Label>
                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirm-password">{t('Confirm New Password')}</Label>
                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isSaving} />
                </div>
            </CardContent>
             <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleUpdatePassword} disabled={isSaving}>
                    {isSaving ? t('Updating Password...') : t('Update Password')}
                </Button>
            </CardFooter>
        </Card>
    )
}
