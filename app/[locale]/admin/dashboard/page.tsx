
'use client';

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection } from 'react-firebase-hooks/firestore';
import { collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';
import { useMemo } from 'react';
import { Company, UserProfile } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

export default function AdminDashboardPage() {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [usersSnapshot, usersLoading] = useCollection(collection(db, 'users'));
    const [companiesSnapshot, companiesLoading] = useCollection(collection(db, 'companies'));

    const users = useMemo(() => usersSnapshot?.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile)), [usersSnapshot]);
    const companies = useMemo(() => companiesSnapshot?.docs.map(doc => ({ ...doc.data(), id: doc.id } as Company)), [companiesSnapshot]);

    const { totalUsers, totalCompanies, activeUsers, blockedUsers, paidSubscriptions } = useMemo(() => ({
        totalUsers: users?.length || 0,
        totalCompanies: companies?.length || 0,
        activeUsers: users?.filter(u => u.status === 'active').length || 0,
        blockedUsers: users?.filter(u => u.status === 'blocked').length || 0,
        paidSubscriptions: users?.filter(u => u.isPaid).length || 0,
    }), [users, companies]);
    
    const companyMap = useMemo(() => {
        if (!companies) return new Map<string, string>();
        return new Map(companies.map(c => [c.id!, c.name]));
    }, [companies]);

    const isLoading = usersLoading || companiesLoading;

    const handlePaidChange = async (userId: string, isPaid: boolean) => {
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, { isPaid });
            toast({
                title: t('userUpdated'),
                description: t('userSubscriptionStatusHasBeenUpdated'),
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: t('error'),
                description: error.message || t('failedToUpdateUser'),
            });
        }
    };

    const handleStatusChange = async (userId: string, currentStatus: 'active' | 'blocked' | undefined) => {
        const newStatus = currentStatus === 'active' ? 'blocked' : 'active';
        const userRef = doc(db, 'users', userId);
        try {
            await updateDoc(userRef, { status: newStatus });
            toast({
                title: t('userUpdated'),
                description: t('userAccountStatusHasBeenUpdated'),
            });
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: t('error'),
                description: error.message || t('failedToUpdateUser'),
            });
        }
    };

    return (
        <div className="flex flex-col gap-8">
            <h1 className="text-2xl font-bold">{t('adminDashboard')}</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('totalUsers')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-bold">{isLoading ? <Skeleton className="h-10 w-16" /> : totalUsers}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>{t('totalCompanies')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                         <p className="text-4xl font-bold">{isLoading ? <Skeleton className="h-10 w-16" /> : totalCompanies}</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>{t('activeUsers')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-bold text-green-500">{isLoading ? <Skeleton className="h-10 w-16" /> : activeUsers}</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>{t('paidSubscriptions')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-bold text-primary">{isLoading ? <Skeleton className="h-10 w-16" /> : paidSubscriptions}</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>{t('blockedUsers')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-4xl font-bold text-destructive">{isLoading ? <Skeleton className="h-10 w-16" /> : blockedUsers}</p>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>{t('userList')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('name')}</TableHead>
                                    <TableHead>{t('email')}</TableHead>
                                    <TableHead>{t('company')}</TableHead>
                                    <TableHead>{t('role')}</TableHead>
                                    <TableHead>{t('subscription')}</TableHead>
                                    <TableHead>{t('status')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users?.map(user => (
                                    <TableRow key={user.uid}>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>{companyMap.get(user.companyId) || t('unassigned')}</TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{t(user.role)}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={user.isPaid}
                                                onCheckedChange={(checked) => handlePaidChange(user.uid, checked)}
                                                aria-label={t('toggleSubscriptionStatus')}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Switch
                                                checked={user.status === 'active'}
                                                onCheckedChange={() => handleStatusChange(user.uid, user.status)}
                                                aria-label={t('toggleAccountStatus')}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
