'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, Eye, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Supplier, Currency } from '@/lib/types';
import AddSupplierDialog from '@/components/suppliers/add-supplier-dialog';
import EditSupplierDialog from '@/components/suppliers/edit-supplier-dialog';
import DeleteSupplierDialog from '@/components/suppliers/delete-supplier-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { useCurrency } from '@/lib/currency-provider';
import SupplierSheet from '@/app/[locale]/(app)/suppliers/supplier-sheet';
import MakeSupplierPaymentDialog from '@/app/[locale]/(app)/suppliers/make-payment-dialog';
import { recordSupplierPaymentFIFO } from '@/lib/ledger-recompute';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { formatMoneyMinor } from '@/lib/money';
import { FancyCard } from '@/components/ui/fancy-card';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { firestore, companyId } = useFirebase();
  const { toast } = useToast();
  const { baseCurrency } = useCurrency();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  const { data: suppliers, loading: suppliersLoading } = useCompanyCollection<Supplier>('suppliers');

  const handleAddSupplier = async (supplierData: Omit<Supplier, 'id' | 'companyId'>) => {
    if (!firestore || !companyId) return;
    try {
      await addDoc(companyCollection(firestore, companyId, 'suppliers'), {
        ...withCompanyId(companyId, supplierData),
        createdAt: serverTimestamp(),
        balanceDueByCurrency: {}, // Initialize balance
      });
      toast({ title: t('toast.success.supplierAdded'), description: t('toast.success.supplierAddedSuccessMessage') });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleUpdateSupplier = async (supplierId: string, supplierData: Partial<Supplier>) => {
    if (!firestore || !companyId) return;
    try {
      const supplierRef = companyDoc(firestore, companyId, `suppliers/${supplierId}`);
      await updateDoc(supplierRef, supplierData);
      toast({ title: t('toast.success.supplierUpdated'), description: t('toast.success.supplierUpdatedSuccessMessage') });
      setIsEditDialogOpen(false);
      setSelectedSupplier(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleDeleteSupplier = async () => {
    if (!firestore || !selectedSupplier?.id || !companyId) return;
    try {
      await deleteDoc(companyDoc(firestore, companyId, `suppliers/${selectedSupplier.id}`));
      toast({ title: t('toast.success.supplierDeleted'), description: t('toast.success.supplierDeletedSuccessMessage') });
      setIsDeleteDialogOpen(false);
      setSelectedSupplier(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleMakePayment = async (supplierId: string, amountMinor: number, currency: Currency, note?: string) => {
    if (!firestore || !companyId) {
      const msg = t('toast.error.companyIdMissingError');
      toast({ variant: "destructive", title: t('toast.error.title'), description: msg });
      throw new Error(msg);
    }

    try {
      await recordSupplierPaymentFIFO(firestore, companyId, supplierId, amountMinor, currency, note);

      toast({ title: t('toast.success.paymentRecorded'), description: t('toast.success.paymentRecordedSuccessMessage') });
      setIsPaymentDialogOpen(false);
      setSelectedSupplier(null);
    } catch (e: any) {
      console.error('[handleMakePayment] failed:', e);
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message ?? String(e) });
      throw e; // IMPORTANT: propagate failure to the dialog
    }
  };

  const openEditDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setIsDeleteDialogOpen(true);
  };

  const openPaymentDialog = (supplier: Supplier) => {
      setSelectedSupplier(supplier);
      setIsPaymentDialogOpen(true);
  }

  const openSheet = (supplier: Supplier) => {
      setSelectedSupplier(supplier);
      setIsSheetOpen(true);
  }

  const totalBalanceByCurrency = useMemo(() => {
    const totals: { [key in Currency]?: number } = {};
    suppliers.forEach(s => {
        for (const [currency, amount] of Object.entries(s.balanceDueByCurrency || {})) {
            if (amount > 0) {
                totals[currency as Currency] = (totals[currency as Currency] || 0) + amount;
            }
        }
    });
    return totals;
  }, [suppliers]);

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('suppliers.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('suppliers.pageDescription')}</p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('suppliers.addSupplier')}
          </Button>
        </div>

        <FancyCard>
          <CardHeader>
            <CardTitle>{t('suppliers.supplierRecords')}</CardTitle>
            <CardDescription>
                {t('suppliers.totalBalanceDue')}:{' '}
                {Object.entries(totalBalanceByCurrency).map(([cur, amt]) => (
                    <span key={cur} className="font-bold mr-4">{formatMoneyMinor(amt, cur as Currency)}</span>
                ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suppliersLoading ? <p>{t('suppliers.loadingSuppliers')}...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('suppliers.supplierName')}</TableHead>
                    <TableHead>{t('suppliers.contact')}</TableHead>
                    <TableHead>{t('suppliers.balanceDue')}</TableHead>
                    <TableHead className="text-center">{t('suppliers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => {
                    const supplierBalance = Object.entries(supplier.balanceDueByCurrency || {})
                      .filter(([_, value]) => value && value > 0)
                      .map(([currency, value]) => formatMoneyMinor(value, currency as Currency))
                      .join(' / ');
                    return (
                        <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.email || supplier.phone || 'N/A'}</TableCell>
                        <TableCell className="font-medium">{supplierBalance || formatMoneyMinor(0, baseCurrency)}</TableCell>
                        <TableCell className="text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openSheet(supplier)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    <span>{t('suppliers.viewLedger')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPaymentDialog(supplier)}>
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    <span>{t('suppliers.makePayment')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(supplier)}>{t('suppliers.edit')}</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDeleteDialog(supplier)} className="text-destructive">{t('suppliers.delete')}</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </FancyCard>
      </div>
      <AddSupplierDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onAddSupplier={handleAddSupplier} />
      {selectedSupplier && <EditSupplierDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} supplier={selectedSupplier} onUpdateSupplier={handleUpdateSupplier} />}
      {selectedSupplier && <DeleteSupplierDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} onConfirm={handleDeleteSupplier} />}
      {selectedSupplier && <SupplierSheet open={isSheetOpen} onOpenChange={setIsSheetOpen} supplier={selectedSupplier} />}
      {selectedSupplier && <MakeSupplierPaymentDialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen} supplier={selectedSupplier} onConfirm={handleMakePayment} />}
    </>
  );
}
