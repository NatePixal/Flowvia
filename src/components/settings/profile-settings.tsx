
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase'; // No longer need useDoc from here
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User as UserIcon } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '../ui/skeleton';
import { FancyCard } from '../ui/fancy-card';


export default function ProfileSettings() {
    const { t } = useTranslation();
    // Correctly source all user data from the central provider
    const { firestore, user, userProfile: currentUserProfile, isUserLoading: isLoading } = useFirebase();
    const { toast } = useToast();
    
    // The user's profile document reference
    const userProfileRef = useMemo(() => {
        if (!user?.uid || !firestore) {
            return null;
        }
        return doc(firestore, 'users', user.uid);
    }, [firestore, user?.uid]);

    const [name, setName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        // When the central userProfile is available, update the local form state.
        if (currentUserProfile) {
            setName(currentUserProfile.name || '');
            setPhoneNumber(currentUserProfile.phoneNumber || '');
        }
    }, [currentUserProfile]);

    const handleSaveChanges = async () => {
        if (!userProfileRef) return;
        setIsSaving(true);
        try {
            await updateDoc(userProfileRef, {
                name,
                phoneNumber
            });
            toast({ title: t('toast.success.profileUpdated'), description: t('toast.success.yourProfileHasBeenUpdated')});
        } catch (error: any) {
            toast({ variant: 'destructive', title: t('toast.error.title'), description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const names = name.split(' ').filter(Boolean);
        if (names.length === 0) return "U";
        if (names.length === 1) return names[0].charAt(0).toUpperCase();
        return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
    }


    if (isLoading) {
        return (
            <FancyCard>
                <CardHeader>
                    <CardTitle>{t('settings.profile')}</CardTitle>
                    <CardDescription>{t('settings.manageYourPersonalInformation')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center space-x-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div className="space-y-2">
                           <Skeleton className="h-4 w-48" />
                        </div>
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </FancyCard>
        );
    }
    
    if (!currentUserProfile && !isLoading) {
        return (
             <FancyCard>
                <CardHeader>
                    <CardTitle>{t('settings.profile')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertTitle>{t('toast.error.errorLoadingProfile')}</AlertTitle>
                        <AlertDescription>{t('toast.error.couldNotLoadUserProfile')}</AlertDescription>
                    </Alert>
                </CardContent>
            </FancyCard>
        )
    }

    return (
        <FancyCard>
            <CardHeader>
                <CardTitle>{t('settings.profile')}</CardTitle>
                <CardDescription>{t('settings.manageYourPersonalInformation')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="flex items-center space-x-4">
                    <Avatar className="h-20 w-20">
                        <AvatarImage src={user?.photoURL || undefined} alt={name} />
                        <AvatarFallback>
                            {currentUserProfile ? getInitials(currentUserProfile.name) : <UserIcon />}
                        </AvatarFallback>
                    </Avatar>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="name">{t('settings.fullName')}</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading || isSaving} />
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="email">{t('settings.email')}</Label>
                    <Input id="email" value={user?.email || ''} disabled />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="phone">{t('settings.phoneNumber')}</Label>
                    <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} disabled={isLoading || isSaving} />
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleSaveChanges} disabled={isLoading || isSaving}>
                    {isSaving ? t('settings.saving') : t('settings.saveChanges')}
                </Button>
            </CardFooter>
        </FancyCard>
    )
}
