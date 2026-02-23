
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase, useDoc } from '@/firebase';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Company, Currency } from '@/lib/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { hasPermission } from '@/lib/permissions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FancyCard } from '../ui/fancy-card';

export default function CompanySettings() {
    const { t } = useTranslation();
    const { firestore, userProfile } = useFirebase();
    const { toast } = useToast();

    const [companyName, setCompanyName] = useState('');
    const [numUsers, setNumUsers] = useState('');
    const [warehouseCapacity, setWarehouseCapacity] = useState('');
    const [warehouseCapacityType, setWarehouseCapacityType] = useState<'units' | 'volume'>('units');
    const [baseCurrency, setBaseCurrency] = useState<Currency>('USD');
    const [isSaving, setIsSaving] = useState(false);

    const companyId = userProfile?.companyId;
    const canEdit = hasPermission(userProfile, 'company', 'edit');

    const companyQuery = useMemo(() => {
        if (!firestore || !companyId) return null;
        return doc(firestore, 'companies', companyId);
    }, [firestore, companyId]);

    const { data: company, isLoading: companyLoading, error: companyError } = useDoc<Company>(companyQuery);
    
    useEffect(() => {
        if (company) {
            setCompanyName(company.name || '');
            setNumUsers(String(company.userCount) || '');
            setWarehouseCapacity(String(company.warehouseCapacity || ''));
            setWarehouseCapacityType(company.warehouseCapacityType || 'units');
            setBaseCurrency(company.baseCurrency || 'USD');
        }
    }, [company]);

    const handleInitializeCompany = async () => {
      if (!firestore || !companyId) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
        return;
      }
    
      if (!canEdit) {
        toast({ variant: 'destructive', title: t('toast.error.accessDenied'), description: t('settings.youDoNotHavePermissionToEditCompany') });
        return;
      }
    
      setIsSaving(true);
      try {
        const companyRef = doc(firestore, 'companies', companyId);
    
        await setDoc(
          companyRef,
          {
            name: companyName || userProfile?.name || 'My Company',
            ownerId: userProfile?.id,
            userCount: 1,
            baseCurrency: baseCurrency,
            warehouseCapacity: 0,
            warehouseCapacityType: 'units',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
    
        toast({ title: t('toast.success.companyInitialized'), description: t('toast.success.yourCompanyDetailsHaveBeenSaved') });
      } catch (error: any) {
        console.error('Initialize company failed:', error);
        toast({ variant: 'destructive', title: t('toast.error.title'), description: error.message || t('toast.error.failedToSaveChanges') });
      } finally {
        setIsSaving(false);
      }
    };

    const handleSaveChanges = async () => {
        if (!firestore || !companyId || !company) return;

        if (!canEdit) {
            toast({ variant: 'destructive', title: t('toast.error.accessDenied'), description: t('settings.youDoNotHavePermissionToEditCompany') });
            return;
        }

        setIsSaving(true);
        try {
            const companyRef = doc(firestore, "companies", companyId);
            
            const updates: Partial<Company> = {
                name: companyName,
                userCount: parseInt(numUsers, 10) || 0,
                warehouseCapacity: parseInt(warehouseCapacity, 10) || 0,
                warehouseCapacityType: warehouseCapacityType,
                updatedAt: serverTimestamp(),
            };
            
            // For safety, only allow developers or admins to change base currency after it's set.
            if (userProfile?.role === 'developer' || userProfile?.role === 'admin') {
                updates.baseCurrency = baseCurrency;
            }

            await updateDoc(companyRef, updates);
            toast({ title: t('toast.success.companyDetailsUpdated'), description: t('toast.success.yourCompanyDetailsHaveBeenUpdated')});
        } catch (error: any) {
            console.error("Save failed:", error);
            toast({ variant: 'destructive', title: t('toast.error.title'), description: error.message || t('toast.error.failedToSaveChanges') });
        } finally {
            setIsSaving(false);
        }
    };
    
    if (companyLoading) {
         return (
            <FancyCard>
                <CardHeader>
                    <CardTitle>{t('settings.company')}</CardTitle>
                    <CardDescription>{t('settings.manageYourCompanyDetails')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center space-x-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div className="space-y-2">
                           <Skeleton className="h-4 w-48" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                        <Skeleton className="h-10 w-full" />
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button disabled>{t('settings.saveChanges')}</Button>
                </CardFooter>
            </FancyCard>
        );
    }
    
    if (companyError) {
        return (
            <FancyCard>
                <CardHeader><CardTitle>{t('settings.company')}</CardTitle></CardHeader>
                <CardContent>
                    <Alert variant="destructive">
                        <AlertTitle>{t('toast.error.errorLoadingCompanyData')}</AlertTitle>
                        <AlertDescription>{companyError.message}</AlertDescription>
                    </Alert>
                </CardContent>
            </FancyCard>
        )
    }

    if (!company && !companyLoading) {
      return (
        <FancyCard>
          <CardHeader>
            <CardTitle>{t('settings.company')}</CardTitle>
            <CardDescription>{t('settings.manageYourCompanyDetails')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p>{t('settings.noCompanyFoundToManage')}</p>
    
            {canEdit && (
              <Alert>
                <AlertTitle>{t('settings.actionRequired') || 'Action required'}</AlertTitle>
                <AlertDescription>
                  {t('settings.companyRecordIsMissing')}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
    
          {canEdit && (
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={handleInitializeCompany} disabled={isSaving}>
                {isSaving ? t('settings.saving') : (t('settings.initializeCompany') || 'Initialize Company')}
              </Button>
            </CardFooter>
          )}
        </FancyCard>
      );
    }

    const isBaseCurrencyChangeable = userProfile?.role === 'developer' || userProfile?.role === 'admin';

    return (
        <FancyCard>
            <CardHeader>
                <CardTitle>{t('settings.company')}</CardTitle>
                <CardDescription>{t('settings.manageYourCompanyDetails')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center space-x-4">
                     <Avatar className="h-20 w-20">
                        <AvatarImage src={undefined} alt={companyName} />
                        <AvatarFallback>
                            <Building2 className="h-8 w-8" />
                        </AvatarFallback>
                    </Avatar>
                </div>
                 <div className="space-y-2">
                    <Label htmlFor="companyId">{t('settings.companyId')}</Label>
                    <Input id="companyId" value={companyId || ''} disabled />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="companyName">{t('settings.companyName')}</Label>
                    <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={isSaving || !canEdit} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="baseCurrency">{t('settings.baseCurrency')}</Label>
                  <Select value={baseCurrency} onValueChange={(v) => setBaseCurrency(v as Currency)} disabled={!isBaseCurrencyChangeable}>
                      <SelectTrigger>
                          <SelectValue placeholder={t('settings.selectBaseCurrency')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD - United States Dollar</SelectItem>
                          <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                          <SelectItem value="SAR">SAR - Saudi Riyal</SelectItem>
                          <SelectItem value="JOD">JOD - Jordanian Dinar</SelectItem>
                          <SelectItem value="EGP">EGP - Egyptian Pound</SelectItem>
                          <SelectItem value="UZS">UZS - Uzbekistani So'm</SelectItem>
                          <SelectItem value="CNY">CNY - Chinese Yuan</SelectItem>
                      </SelectContent>
                  </Select>
                   {!isBaseCurrencyChangeable && <p className="text-xs text-muted-foreground">{t('settings.contactDeveloperToChangeBaseCurrency')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="numUsers">{t('settings.numberOfUsers')}</Label>
                    <Input id="numUsers" type="number" value={numUsers} onChange={(e) => setNumUsers(e.target.value)} disabled={isSaving || !canEdit} />
                </div>
                
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="font-semibold">{t('settings.warehouseSettings')}</Label>
                     <div className="space-y-2">
                        <Label htmlFor="warehouseCapacity">{t('settings.warehouseCapacity')}</Label>
                        <Input id="warehouseCapacity" type="number" value={warehouseCapacity} onChange={(e) => setWarehouseCapacity(e.target.value)} placeholder={t('settings.totalWarehouseUnitCapacity')} disabled={isSaving || !canEdit} />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('settings.capacityType')}</Label>
                         <RadioGroup value={warehouseCapacityType} onValueChange={(v) => setWarehouseCapacityType(v as 'units' | 'volume')} className="flex gap-4" disabled={!canEdit}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="units" id="r_units" />
                                <Label htmlFor="r_units">{t('settings.units')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="volume" id="r_volume" />
                                <Label htmlFor="r_volume">{t('settings.volume')}</Label>
                            </div>
                        </RadioGroup>
                        <p className="text-xs text-muted-foreground">
                            {warehouseCapacityType === 'units' ? t('settings.capacityInTotalItemUnits') : t('settings.capacityInCubicMeters')}
                        </p>
                    </div>
                </div>
            </CardContent>
            {canEdit && (
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving ? t('settings.saving') : t('settings.saveChanges')}
                    </Button>
                </CardFooter>
            )}
        </FancyCard>
    )
}
