'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
import { addDoc, deleteDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useFirebase } from '@/firebase/provider';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { useToast } from '@/hooks/use-toast';

import AddSellerDialog from '@/components/sellers/add-seller-dialog';
import EditSellerDialog from '@/components/sellers/edit-seller-dialog';
import type { Seller } from '@/lib/types';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { FancyCard } from '@/components/ui/fancy-card';

export default function SellersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { firestore, companyId } = useFirebase();

  const { data: sellers, loading, error } = useCompanyCollection<Seller>('sellers');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);

  const sortedSellers = useMemo(() => {
    const list = [...(sellers || [])];
    list.sort((a, b) => {
      // active first
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [sellers]);

  const handleAddSeller = async (sellerData: Omit<Seller, 'id' | 'companyId' | 'createdAt'>) => {
    if (!firestore || !companyId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
      return;
    }

    try {
      await addDoc(companyCollection(firestore, companyId, 'sellers'), {
        ...withCompanyId(companyId, sellerData),
        createdAt: serverTimestamp(),
      });

      toast({ title: t('toast.success.title'), description: t('toast.success.sellerAdded') });
      setIsAddOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message });
    }
  };

  const handleUpdateSeller = async (sellerId: string, sellerData: Partial<Seller>) => {
    if (!firestore || !companyId) return;

    try {
      await updateDoc(companyDoc(firestore, companyId, `sellers/${sellerId}`), sellerData);
      toast({ title: t('toast.success.title'), description: t('toast.success.sellerUpdated') });

      setIsEditOpen(false);
      setSelectedSeller(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message });
    }
  };

  const handleDeleteSeller = async (seller: Seller) => {
    if (!firestore || !companyId || !seller?.id) return;

    const ok = window.confirm(`${t('sellers.areYouSureYouWantToDelete')} "${seller.name}"? ${t('sellers.thisActionCannotBeUndone')}`);
    if (!ok) return;

    try {
      await deleteDoc(companyDoc(firestore, companyId, `sellers/${seller.id}`));
      toast({ title: t('toast.success.title'), description: t('toast.success.sellerDeleted') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('sellers.pageTitle')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('sellers.pageDescription')}
          </p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          {t('sellers.addSeller')}
        </Button>
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('sellers.pageTitle')}</CardTitle>
          <CardDescription>
            {t('sellers.sellersListDescription')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">{t('sellers.loading')}</div>}
          {error && (
            <div className="text-sm text-destructive">
              {t('toast.error.title')}: {String(error.message || error)}
            </div>
          )}

          {!loading && !error && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('sellers.seller')}</TableHead>
                  <TableHead>{t('sellers.contactDetails')}</TableHead>
                  <TableHead>{t('sellers.status')}</TableHead>
                  <TableHead className="text-right">{t('sellers.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      {t('sellers.noData')}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedSellers.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.contact || '-'}</TableCell>
                      <TableCell>{t(`status.${s.status}`)}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t('sellers.openMenu')}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedSeller(s);
                                setIsEditOpen(true);
                              }}
                            >
                              {t('sellers.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteSeller(s)}>
                              {t('sellers.delete')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleUpdateSeller(s.id, { status: s.status === 'active' ? 'inactive' : 'active' })}
                            >
                              {s.status === 'active' ? t('sellers.deactivate') : t('sellers.activate')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </FancyCard>

      <AddSellerDialog open={isAddOpen} onOpenChange={setIsAddOpen} onAddSeller={handleAddSeller} />

      {selectedSeller && (
        <EditSellerDialog
          open={isEditOpen}
          onOpenChange={(open) => {
            setIsEditOpen(open);
            if (!open) setSelectedSeller(null);
          }}
          seller={selectedSeller}
          onUpdateSeller={handleUpdateSeller}
        />
      )}
    </div>
  );
}
