
'use client';

import { useState } from 'react';
import { createInvite } from '@/lib/invites';
import { useFirebase } from '@/firebase';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Copy } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { ROLE_ACCESS, UserRole } from '@/lib/roles';

export default function InviteUsersPage() {
  const { t } = useTranslation();
  const { userProfile } = useFirebase();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'sales' as UserRole,
  });
  const [isSending, setIsSending] = useState(false);

  if (!hasPermission(userProfile, 'users', 'invite')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('accessDenied')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{t('youDoNotHavePermissionToInviteUsers')}</p>
        </CardContent>
      </Card>
    );
  }

  const roleInfo = ROLE_ACCESS[form.role];

  async function handleInvite() {
    if (!form.email || !form.name) {
      toast({
        variant: 'destructive',
        title: t('missingInformation'),
        description: t('pleaseFillOutNameAndEmail'),
      });
      return;
    }
    if (!userProfile?.companyId) {
       toast({
        variant: 'destructive',
        title: t('error'),
        description: t('couldNotFindYourCompanyId'),
      });
      return;
    }

    setIsSending(true);
    try {
      const inviteId = await createInvite({
        ...form,
        companyId: userProfile.companyId,
      });

      const inviteLink = `${window.location.origin}/register?invite=${inviteId}`;
      
      navigator.clipboard.writeText(inviteLink);

      toast({
        title: t('invitationLinkReady'),
        description: (
          <div className="flex flex-col gap-2">
            <span>{t('invitationLinkCopied')}</span>
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
              <input type="text" readOnly value={inviteLink} className="flex-1 bg-transparent text-sm outline-none" />
              <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(inviteLink)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ),
        duration: 10000,
      });

      setForm({ name: '', email: '', role: 'sales' });
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: t('invitationFailed'),
        description: error.message || t('anUnknownErrorOccurred'),
      });
    } finally {
        setIsSending(false);
    }
  }

  return (
    <div className="space-y-6">
       <div>
            <h1 className="text-3xl font-bold tracking-tight">{t('inviteEmployee')}</h1>
            <p className="text-muted-foreground">{t('sendAnInvitationToJoinYourCompany')}</p>
        </div>
      <Card className="max-w-2xl">
        <CardHeader>
            <CardTitle>{t('employeeDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
             <div className="space-y-2">
                <Label htmlFor="name">{t('fullName')}</Label>
                <Input
                    id="name"
                    placeholder={t('fullNamePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={isSending}
                />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('emailAddress')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              disabled={isSending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t('assignRole')}</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setForm({ ...form, role: value as UserRole })}
              disabled={isSending}
            >
                <SelectTrigger id="role">
                    <SelectValue placeholder={t('selectARole')} />
                </SelectTrigger>
                <SelectContent>
                    {Object.keys(ROLE_ACCESS).map((role) => (
                      <SelectItem key={role} value={role} disabled={role === 'developer'}>
                          {t(role)}
                      </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>

          {roleInfo && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="mb-2 font-semibold text-foreground">{t(roleInfo.description)}</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button onClick={handleInvite} disabled={isSending}>
                {isSending ? t('sendingInvitation') : t('sendInvitation')}
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
