
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { collection, doc, getDocs, writeBatch, serverTimestamp, query, where, getDoc } from 'firebase/firestore';
import type { Company } from '@/lib/types';
import { useTranslation } from 'react-i18next';

export default function MigrateDataPage() {
    const { t } = useTranslation();
    const { firestore, userProfile, user } = useFirebase();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const isDeveloper = userProfile?.role === 'developer';

    const handleMigration = async () => {
        if (!firestore || !user || !isDeveloper) {
            toast({ variant: 'destructive', title: t('error'), description: t('youAreNotAuthorized') });
            return;
        }

        setIsLoading(true);
        toast({ title: t('migrationStarted'), description: t('thisMayTakeAMoment') });

        try {
            const batch = writeBatch(firestore);
            
            // 1. Ensure developer has a company
            let companyId = userProfile.companyId;
            if (!companyId) {
                const newCompanyRef = doc(collection(firestore, 'companies'));
                const newCompany: Company = {
                    name: `${userProfile.name}'s Company`,
                    ownerId: user.uid,
                    createdAt: serverTimestamp() as any,
                    userCount: 1,
                };
                batch.set(newCompanyRef, newCompany);
                
                const userRef = doc(firestore, 'users', user.uid);
                batch.update(userRef, { companyId: newCompanyRef.id });

                companyId = newCompanyRef.id;
                toast({ title: t('companyCreated'), description: t('aNewCompanyWasCreatedForYou') });
            }

            // 2. Find and assign all orphan documents
            const collectionsToMigrate = ['products', 'sales', 'clients', 'suppliers', 'employees', 'dailyExpenses', 'incomingProducts', 'client_transactions', 'client_loans', 'client_payments', 'inventoryLogs', 'sellers'];

            for (const coll of collectionsToMigrate) {
                // Query for documents where companyId is not set or is null
                const q = query(collection(firestore, coll), where('companyId', '==', null));
                const snapshot = await getDocs(q);
                
                if (!snapshot.empty) {
                    let count = 0;
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, { companyId: companyId });
                        count++;
                    });
                    toast({ title: t('dataMigrated'), description: `${count} items from ${coll} were assigned to your company.` });
                }
            }

            // Commit all batched writes
            await batch.commit();

            toast({ title: t('migrationComplete'), description: t('allOrphanDataHasBeenAssigned') });

        } catch (e: any) {
            console.error("Migration failed:", e);
            toast({ variant: 'destructive', title: t('migrationFailed'), description: e.message });
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('dataMigrationTool')}</CardTitle>
                <CardDescription>{t('assignOrphanDataToYourCompany')}</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    {t('migrationToolDescription')}
                </p>
            </CardContent>
            <CardContent>
                <Button onClick={handleMigration} disabled={isLoading || !isDeveloper}>
                    {isLoading ? t('migrating') : t('runMigration')}
                </Button>
            </CardContent>
        </Card>
    );
}
