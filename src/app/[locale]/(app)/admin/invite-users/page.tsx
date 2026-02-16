'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import { useFirebase } from '@/firebase/provider';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ROLE_ACCESS } from '@/lib/roles';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { z } from 'zod';

export default function InviteUsersPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { userProfile, firebaseApp } = useFirebase();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<{success: boolean, message: string} | null>(null);

    const availableRoles = Object.keys(ROLE_ACCESS).filter(r => r !== 'developer');

    const inviteSchema = z.object({
      name: z.string().min(2, "Full name must be at least 2 characters long."),
      email: z.string().email("Please enter a valid email address."),
      password: z.string().min(8, "Password must be at least 8 characters long."),
      role: z.string().refine(val => availableRoles.includes(val), { message: "Please select a valid role." }),
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setResult(null);

        const validationResult = inviteSchema.safeParse({ name, email, password, role });
        if (!validationResult.success) {
            const errorMessages = validationResult.error.errors.map(e => e.message).join('\n');
            setResult({ success: false, message: errorMessages });
            toast({ variant: 'destructive', title: t('toast.error.validationFailed'), description: errorMessages });
            return;
        }

        if (!userProfile?.companyId) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
            return;
        }

        setIsLoading(true);

        const functions = getFunctions(firebaseApp, 'us-central1');
        const inviteUser = httpsCallable(functions, 'inviteUserToCompany');

        try {
            await inviteUser({
                ...validationResult.data,
                companyId: userProfile.companyId,
            });
            setResult({ success: true, message: t('inviteUsers.userInvitedSuccessfully')});
            // Reset form
            setName('');
            setEmail('');
            setPassword('');
            setRole('');
        } catch (error: any) {
            console.error(error);
            setResult({ success: false, message: error.message || t('inviteUsers.failedToInviteUser') });
            toast({ variant: 'destructive', title: t('toast.error.title'), description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    if (!hasPermission(userProfile, 'users', 'create')) {
        return (
            <div className="flex flex-col gap-6">
                <h1 className="text-2xl font-bold">{t('inviteUsers.pageTitle')}</h1>
                <Card>
                    <CardContent className="pt-6">
                        <p>{t('settings.youDoNotHavePermissionToManageUsers')}</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-2xl font-bold">{t('inviteUsers.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('inviteUsers.pageDescription')}</p>
            
            <Card>
                <CardHeader>
                    <CardTitle>{t('inviteUsers.newUserInfo')}</CardTitle>
                    <CardDescription>{t('inviteUsers.newUserInfoDescription')}</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="name">{t('inviteUsers.fullName')}</Label>
                                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">{t('inviteUsers.emailAddress')}</Label>
                                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="password">{t('inviteUsers.temporaryPassword')}</Label>
                                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">{t('inviteUsers.role')}</Label>
                                <Select onValueChange={setRole} value={role} required>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('inviteUsers.selectARole')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableRoles.map(r => (
                                            <SelectItem key={r} value={r}>{t(`roles.${r}`)}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                         {result && (
                            <Alert variant={result.success ? 'default' : 'destructive'}>
                                {result.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                <AlertTitle>{result.success ? t('toast.success.title') : t('toast.error.title')}</AlertTitle>
                                <AlertDescription className="whitespace-pre-wrap">{result.message}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                    <CardContent>
                       <Button type="submit" disabled={isLoading}>
                           {isLoading ? t('inviteUsers.invitingUser') : t('inviteUsers.inviteUser')}
                       </Button>
                    </CardContent>
                </form>
            </Card>
        </div>
    )
}
