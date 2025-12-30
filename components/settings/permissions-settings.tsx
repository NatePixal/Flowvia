
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { useCompanyUsers } from '@/hooks/use-company-users';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { UserProfile, UserRole, UserPermissions } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cloneDeep } from 'lodash';

// Define the structure of the permission matrix
const permissionModules = {
  products: ['create', 'edit', 'delete'],
  sales: ['create', 'refund'],
  expenses: ['create', 'edit', 'delete'],
};

export default function PermissionsSettings() {
    const { t } = useTranslation();
    const { firestore, userProfile } = useFirebase();
    const { toast } = useToast();
    
    const isAdmin = userProfile?.role === 'admin' || userProfile?.role === 'developer';
    const { users, loading, error } = useCompanyUsers(userProfile?.companyId);

    // Local state to manage changes before saving
    const [localUsers, setLocalUsers] = useState<UserProfile[]>([]);

    useEffect(() => {
        if (users) {
            // Use cloneDeep to avoid direct mutation of the prop
            setLocalUsers(cloneDeep(users));
        }
    }, [users]);
    
    const handleRoleChange = (userId: string, newRole: UserRole) => {
        setLocalUsers(prev => 
            prev.map(u => u.uid === userId ? { ...u, role: newRole } : u)
        );
    };

    const handlePermissionChange = (userId: string, module: keyof UserPermissions, action: string, checked: boolean) => {
        setLocalUsers(prev => 
            prev.map(u => {
                if (u.uid === userId) {
                    const updatedUser = cloneDeep(u);
                    if (!updatedUser.permissions) {
                        updatedUser.permissions = {};
                    }
                    if (!updatedUser.permissions[module]) {
                        updatedUser.permissions[module] = {};
                    }
                    updatedUser.permissions[module]![action as keyof any] = checked;
                    return updatedUser;
                }
                return u;
            })
        );
    };

    const handleSaveChanges = async (userToSave: UserProfile) => {
        if (!firestore) return;
        try {
            const userDocRef = doc(firestore, 'users', userToSave.uid);
            await updateDoc(userDocRef, {
                role: userToSave.role,
                permissions: userToSave.permissions
            });
            toast({ title: t('userUpdated'), description: `${userToSave.name}'s permissions have been updated.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateUser') });
        }
    };

    if (!isAdmin) {
         return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('permissions')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">{t('youDoNotHavePermissionToManageUsers')}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('userManagement')}</CardTitle>
                <CardDescription>{t('manageUserRolesAndPermissionsForYourCompany')}</CardDescription>
            </CardHeader>
            <CardContent>
                {loading && <p>{t('loadingUsers')}...</p>}
                {error && <p className="text-destructive">{t('errorLoadingUsers')}: {error.message}</p>}
                {!loading && localUsers && (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('user')}</TableHead>
                                <TableHead>{t('role')}</TableHead>
                                <TableHead>{t('permissions')}</TableHead>
                                <TableHead className="text-right">{t('actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {localUsers.map((user) => (
                                <TableRow key={user.uid}>
                                    <TableCell className="font-medium">
                                        <div>{user.name}</div>
                                        <div className="text-xs text-muted-foreground">{user.email}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Select 
                                            value={user.role} 
                                            onValueChange={(newRole) => handleRoleChange(user.uid, newRole as UserRole)}
                                            disabled={user.uid === userProfile?.uid} // Admins can't demote themselves
                                        >
                                            <SelectTrigger className="w-[120px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="admin">{t('admin')}</SelectItem>
                                                <SelectItem value="sales">{t('sales')}</SelectItem>
                                                <SelectItem value="manager">{t('manager')}</SelectItem>
                                                <SelectItem value="accounting">{t('accounting')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {user.role !== 'admin' && (
                                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                                {Object.entries(permissionModules).map(([module, actions]) => (
                                                    <div key={module}>
                                                        <h4 className="font-semibold capitalize text-sm">{t(module)}</h4>
                                                        <div className="flex flex-col space-y-1 mt-1">
                                                            {actions.map(action => (
                                                                <div key={action} className="flex items-center gap-2">
                                                                    <Checkbox
                                                                        id={`${user.uid}-${module}-${action}`}
                                                                        checked={user.permissions?.[module as keyof UserPermissions]?.[action as keyof any] || false}
                                                                        onCheckedChange={(checked) => handlePermissionChange(user.uid, module as keyof UserPermissions, action, !!checked)}
                                                                    />
                                                                    <label htmlFor={`${user.uid}-${module}-${action}`} className="text-xs font-normal capitalize">{t(action)}</label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button size="sm" onClick={() => handleSaveChanges(user)}>{t('save')}</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
        </Card>
    )
}
