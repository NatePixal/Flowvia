
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { useCompanyUsers } from '@/hooks/use-company-users';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { UserProfile, UserRole } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { cloneDeep } from 'lodash';
import { hasPermission } from '@/lib/permissions';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { FancyCard } from '../ui/fancy-card';

export default function PermissionsSettings() {
  const { t } = useTranslation();
  const { firestore, userProfile, firebaseApp } = useFirebase();
  const { toast } = useToast();

  const { users, loading, error, refresh: refreshUsers } = useCompanyUsers(userProfile?.companyId);

  // Local state to manage changes before saving
  const [localUsers, setLocalUsers] = useState<UserProfile[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const availableRoles: UserRole[] = ['admin', 'manager', 'sales', 'accounting'];

  /**
   * IMPORTANT:
   * `users` may be a new array reference on every render (even if content is identical),
   * which would cause an infinite loop if we `setLocalUsers(cloneDeep(users))` on [users].
   * So we sync based on a stable fingerprint of content instead.
   */
  const usersFingerprint =
    users && users.length
      ? users
          .map(u => `${u.id}|${u.role ?? ''}|${u.email ?? ''}|${u.name ?? ''}`)
          .sort()
          .join('||')
      : '__no_users__';

  useEffect(() => {
    if (!users) return;
    setLocalUsers(cloneDeep(users));
  }, [usersFingerprint]); // <-- changed from [users]

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    setLocalUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));
  };

  const handleSaveChanges = async (userToSave: UserProfile) => {
    if (!firestore) return;
    try {
      const userDocRef = doc(firestore, 'users', userToSave.id);
      await updateDoc(userDocRef, {
        role: userToSave.role,
      });
      toast({ title: t('toast.success.userUpdated'), description: `${userToSave.name}'s role has been updated.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message || t('toast.error.couldNotUpdateUser') });
    }
  };

  const handleDeleteUser = async (userToDelete: UserProfile) => {
    if (!firestore || !userProfile?.companyId) return;
    if (userToDelete.id === userProfile.id) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.cannotDeleteYourself') });
        return;
    }
    setIsDeleting(true);
    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const deleteUserFromCompany = httpsCallable(functions, 'deleteUserFromCompany');
        await deleteUserFromCompany({ userId: userToDelete.id, companyId: userProfile.companyId });
        toast({ title: t('toast.success.userDeleted'), description: `${userToDelete.name} has been removed from the company.` });
        await refreshUsers();
    } catch (e: any) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message || t('toast.error.couldNotDeleteUser') });
    } finally {
        setIsDeleting(false);
    }
  }

  if (!hasPermission(userProfile, 'users', 'view')) {
    return (
      <FancyCard>
        <CardHeader>
          <CardTitle>{t('settings.permissions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('settings.youDoNotHavePermissionToManageUsers')}</p>
        </CardContent>
      </FancyCard>
    );
  }

  return (
    <FancyCard>
      <CardHeader>
        <CardTitle>{t('settings.userManagement')}</CardTitle>
        <CardDescription>{t('settings.manageUserRolesForYourCompany')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && <p>{t('settings.loadingUsers')}...</p>}
        {error && (
          <p className="text-destructive">
            {t('settings.errorLoadingUsers')}: {error.message}
          </p>
        )}

        {!loading && localUsers && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.user')}</TableHead>
                <TableHead>{t('settings.role')}</TableHead>
                <TableHead className="text-right">{t('settings.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localUsers.map(user => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <div>{user.name}</div>
                    <div className="text-xs text-muted-foreground">{user.email}</div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={newRole => handleRoleChange(user.id, newRole as UserRole)}
                      disabled={user.id === userProfile?.id || user.role === 'developer'}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoles.map(role => (
                          <SelectItem key={role} value={role}>
                            {t(`roles.${role}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" onClick={() => handleSaveChanges(user)} disabled={user.role === 'developer' || isDeleting}>
                      {t('settings.save')}
                    </Button>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                             <Button
                                size="sm"
                                variant="destructive"
                                disabled={user.id === userProfile?.id || user.role === 'developer' || isDeleting}
                            >
                                {t('settings.delete')}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                            <AlertDialogTitle>{t('settings.areYouAbsolutelySure')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('settings.thisActionIsIrreversible', { userName: user.name, userEmail: user.email })}
                            </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                            <AlertDialogCancel>{t('clients.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteUser(user)} disabled={isDeleting}>
                                {isDeleting ? t('settings.deleting') : t('settings.confirmDelete')}
                            </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </FancyCard>
  );
}
