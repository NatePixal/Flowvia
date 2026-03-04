'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Location } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Button } from '@/components/ui/button';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { createLocationFn, updateLocationFn, deleteLocationFn } from '@/lib/flowvia-functions';
import { PlusCircle, Trash2, Pencil } from 'lucide-react';

export default function ManageLocationsPage() {
  const { t } = useTranslation();
  const { companyId, userProfile, locationsEnabled } = useFirebase();
  const { toast } = useToast();

  const { data: locations } = useCompanyCollection<Location>('locations');

  const canView = hasPermission(userProfile, 'locations', 'view');
  const canEdit = hasPermission(userProfile, 'locations', 'edit');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [active, setActive] = useState(true);

  const reset = () => {
    setEditing(null);
    setName('');
    setCode('');
    setActive(true);
  };

  const openCreate = () => {
    reset();
    setOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setName(loc.name || '');
    setCode(loc.code || '');
    setActive(loc.active !== false);
    setOpen(true);
  };

  const save = async () => {
    if (!companyId) return;
    if (!name.trim()) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('locations.nameRequired') });
      return;
    }

    try {
      if (!editing) {
        await createLocationFn({ companyId, name: name.trim(), code: code.trim() || undefined });
        toast({ title: t('locations.created'), description: t('locations.createdDesc') });
      } else {
        await updateLocationFn({ companyId, id: editing.id, name: name.trim(), code: code.trim() || undefined, active });
        toast({ title: t('locations.updated'), description: t('locations.updatedDesc') });
      }
      setOpen(false);
      reset();
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  };

  const remove = async (loc: Location) => {
    if (!companyId) return;
    const ok = window.confirm(t('locations.confirmDelete', { name: loc.name }));
    if (!ok) return;

    try {
      await deleteLocationFn({ companyId, id: loc.id });
      toast({ title: t('locations.deleted'), description: t('locations.deletedDesc') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('locations.manageTitle')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('locations.manageTitle')}</h1>
        <p className="text-muted-foreground">{t('locations.manageDesc')}</p>
        {!locationsEnabled && (
          <div className="rounded-md border p-3 text-sm">
            {t('locations.enableFirst')}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={openCreate} disabled={!canEdit || !locationsEnabled}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('locations.add')}
        </Button>
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('locations.listTitle')}</CardTitle>
          <CardDescription>{t('locations.listDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('locations.name')}</TableHead>
                  <TableHead>{t('locations.code')}</TableHead>
                  <TableHead>{t('locations.active')}</TableHead>
                  <TableHead className="text-right">{t('locations.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(locations || []).map((loc) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{loc.name}</TableCell>
                    <TableCell>{loc.code || '-'}</TableCell>
                    <TableCell>{loc.active === false ? t('misc.no') : t('misc.yes')}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(loc)} disabled={!canEdit || !locationsEnabled}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => remove(loc)} disabled={!canEdit || !locationsEnabled}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(locations || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      {t('locations.noLocations')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </FancyCard>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('locations.edit') : t('locations.add')}</DialogTitle>
            <DialogDescription>{t('locations.dialogDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="locName">{t('locations.name')}</Label>
              <Input id="locName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="locCode">{t('locations.code')}</Label>
              <Input id="locCode" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('locations.codePlaceholder')} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">{t('locations.active')}</div>
                <div className="text-xs text-muted-foreground">{t('locations.activeHint')}</div>
              </div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('misc.cancel')}
            </Button>
            <Button onClick={save} disabled={!canEdit || !locationsEnabled}>
              {t('misc.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
