
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User as UserIcon } from 'lucide-react';


export default function ProfileSettings() {
    const { t } = useTranslation();
    const { firestore, user } = useFirebase();
    const { toast } = useToast();
    
    const userProfileRef = useMemoFirebase(() => (firestore && user ? doc(firestore, 'users', user.uid) : null), [firestore, user]);
    const { data: userProfile, isLoading } = useDoc<UserProfile>(userProfileRef);

    const [name, setName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (userProfile) {
            setName(userProfile.name || '');
            setPhoneNumber(userProfile.phoneNumber || '');
        }
    }, [userProfile]);

    const handleSaveChanges = async () => {
        if (!userProfileRef) return;
        setIsSaving(true);
        try {
            await updateDoc(userProfileRef, {
                name,
                phoneNumber
            });
            toast({ title: t('Profile Updated'), description: t('Your profile has been updated.')});
        } catch (error: any) {
            toast({ variant: 'destructive', title: t('Error'), description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const names = name.split(' ');
        if (names.length > 1) {
            return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
        }
        return name[0].toUpperCase();
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Profile')}</CardTitle>
                <CardDescription>{t('Manage your personal information.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="flex items-center space-x-4">
                    <Avatar className="h-20 w-20">
                        <AvatarImage src={user?.photoURL || undefined} alt={name} />
                        <AvatarFallback>
                            {userProfile ? getInitials(userProfile.name) : <UserIcon />}
                        </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                        <Button variant="outline" size="sm">{t('Upload Photo')}</Button>
                        <p className="text-xs text-muted-foreground">{t('Recommended: 400x400px, JPG or PNG.')}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="name">{t('Full Name')}</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading || isSaving} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="email">{t('Email')}</Label>
                    <Input id="email" value={user?.email || ''} disabled />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone">{t('Phone Number')}</Label>
                    <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={isLoading || isSaving} />
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleSaveChanges} disabled={isLoading || isSaving}>
                    {isSaving ? t('Saving...') : t('Save Changes')}
                </Button>
            </CardFooter>
        </Card>
    )
}
