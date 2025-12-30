
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase, useDoc, useMemoFirebase, useCollection } from '@/firebase';
import { doc, updateDoc, getDoc, serverTimestamp, collection, query, limit } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Company, UserProfile } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';


export default function CompanySettings() {
    const { t } = useTranslation();
    const { firestore, user, userProfile } = useFirebase();
    const { toast } = useToast();

    const [companyName, setCompanyName] = useState('');
    const [numUsers, setNumUsers] = useState('');
    const [warehouseCapacity, setWarehouseCapacity] = useState('');
    const [warehouseCapacityType, setWarehouseCapacityType] = useState<'units' | 'volume'>('units');
    const [isSaving, setIsSaving] = useState(false);
    
    const isDeveloper = userProfile?.role === 'developer';
    const [developerCompanyId, setDeveloperCompanyId] = useState<string | null>(null);

    // --- Developer-specific logic to find a company to manage ---
    const allCompaniesQuery = useMemoFirebase(() => {
        return isDeveloper && !userProfile?.companyId ? query(collection(firestore, 'companies'), limit(1)) : null;
    }, [firestore, isDeveloper, userProfile?.companyId]);
    const { data: allCompanies, loading: allCompaniesLoading } = useCollection<Company>(allCompaniesQuery);
    
    useEffect(() => {
        if (isDeveloper && !userProfile?.companyId && allCompanies && allCompanies.length > 0) {
            setDeveloperCompanyId(allCompanies[0].id);
        }
    }, [isDeveloper, userProfile?.companyId, allCompanies]);

    // --- Determine the final companyId to use ---
    const companyId = isDeveloper ? (userProfile?.companyId || developerCompanyId) : userProfile?.companyId;

    const companyQuery = useMemoFirebase(() => (firestore && companyId ? doc(firestore, 'companies', companyId) : null), [firestore, companyId]);
    const { data: company, isLoading: companyLoading } = useDoc<Company>(companyQuery);
    
    useEffect(() => {
        if (company) {
            setCompanyName(company.name || '');
            setNumUsers(String(company.userCount) || '');
            setWarehouseCapacity(String(company.warehouseCapacity || ''));
            setWarehouseCapacityType(company.warehouseCapacityType || 'units');
        }
    }, [company]);

    const handleSaveChanges = async () => {
        if (!firestore || !companyId) {
            toast({ variant: 'destructive', title: t('error'), description: t('companyIdMissingError') });
            return;
        }

        setIsSaving(true);
        try {
            const companyRef = doc(firestore, "companies", companyId);
            
            await updateDoc(companyRef, {
                name: companyName,
                userCount: parseInt(numUsers, 10) || 0,
                warehouseCapacity: parseInt(warehouseCapacity, 10) || 0,
                warehouseCapacityType: warehouseCapacityType,
                updatedAt: serverTimestamp(),
            });
            toast({ title: t('companyDetailsUpdated'), description: t('yourCompanyDetailsHaveBeenUpdated')});
        } catch (error: any) {
            console.error("Save failed:", error);
            toast({ variant: 'destructive', title: t('error'), description: error.message || t('failedToSaveChanges') });
        } finally {
            setIsSaving(false);
        }
    };
    
    const isLoading = companyLoading || (isDeveloper && !userProfile?.companyId && allCompaniesLoading);

    if (isLoading) {
         return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('company')}</CardTitle>
                    <CardDescription>{t('manageYourCompanyDetails')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center space-x-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div className="space-y-2">
                           <Skeleton className="h-8 w-24" />
                           <Skeleton className="h-4 w-48" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="companyName">{t('companyName')}</Label>
                        <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="numUsers">{t('numberOfUsers')}</Label>
                        <Skeleton className="h-10 w-full" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="warehouseCapacity">{t('warehouseCapacity')}</Label>
                        <Skeleton className="h-10 w-full" />
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button disabled>{t('saveChanges')}</Button>
                </CardFooter>
            </Card>
        );
    }
    
    if (!company) {
         return (
             <Card>
                <CardHeader>
                    <CardTitle>{t('company')}</CardTitle>
                    <CardDescription>{t('manageYourCompanyDetails')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>{t('noCompanyFoundToManage')}</p>
                </CardContent>
            </Card>
        );
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('company')}</CardTitle>
                <CardDescription>{t('manageYourCompanyDetails')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                     <Avatar className="h-20 w-20">
                        <AvatarImage src={undefined} alt={companyName} />
                        <AvatarFallback>
                            <Building2 className="h-8 w-8" />
                        </AvatarFallback>
                    </Avatar>
                     <div className="space-y-1">
                        <Button variant="outline" size="sm">{t('uploadLogo')}</Button>
                        <p className="text-xs text-muted-foreground">{t('logoRecommendations')}</p>
                    </div>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="companyId">{t('companyId')}</Label>
                    <Input id="companyId" value={companyId || ''} disabled />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="companyName">{t('companyName')}</Label>
                    <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={isSaving} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="numUsers">{t('numberOfUsers')}</Label>
                    <Input id="numUsers" type="number" value={numUsers} onChange={(e) => setNumUsers(e.target.value)} disabled={isSaving} />
                </div>
                
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="font-semibold">{t('warehouseSettings')}</Label>
                     <div className="space-y-2">
                        <Label htmlFor="warehouseCapacity">{t('warehouseCapacity')}</Label>
                        <Input id="warehouseCapacity" type="number" value={warehouseCapacity} onChange={(e) => setWarehouseCapacity(e.target.value)} placeholder={t('totalWarehouseUnitCapacity')} disabled={isSaving} />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('capacityType')}</Label>
                         <RadioGroup value={warehouseCapacityType} onValueChange={(v) => setWarehouseCapacityType(v as 'units' | 'volume')} className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="units" id="r_units" />
                                <Label htmlFor="r_units">{t('units')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="volume" id="r_volume" />
                                <Label htmlFor="r_volume">{t('volume')}</Label>
                            </div>
                        </RadioGroup>
                        <p className="text-xs text-muted-foreground">
                            {warehouseCapacityType === 'units' ? t('capacityInTotalItemUnits') : t('capacityInCubicMeters')}
                        </p>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
                <Button onClick={handleSaveChanges} disabled={isSaving}>
                    {isSaving ? t('saving') : t('saveChanges')}
                </Button>
            </CardFooter>
        </Card>
    )
}
