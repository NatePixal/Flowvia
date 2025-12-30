
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PlusCircle, Truck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import type { Supplier } from '@/lib/types';
import AddSupplierDialog from '@/components/suppliers/add-supplier-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter, usePathname } from 'next/navigation';
import { useCurrency } from '@/lib/currency-provider';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const router = useRouter();
  const pathname = usePathname();

  const [isAddSupplierDialogOpen, setIsAddSupplierDialogOpen] = useState(false);

  // We only fetch the suppliers, not their contracts, to avoid the permission error.
  const { data: suppliers, isLoading: suppliersLoading } = useCompanyCollection<Supplier>('suppliers');
  
  const loading = suppliersLoading;

  const handleAddSupplier = async (supplierName: string) => {
    if (firestore && userProfile?.companyId) {
        try {
            await addDoc(collection(firestore, 'suppliers'), {
                name: supplierName,
                companyId: userProfile.companyId,
                createdAt: serverTimestamp(),
            });
            toast({ title: t('supplierAdded'), description: `${supplierName} has been added.` });
            setIsAddSupplierDialogOpen(false);
        } catch (e: any) {
            toast({ variant: 'destructive', title: t('error'), description: e.message });
        }
    }
  };

  const handleSupplierClick = (supplierId: string) => {
    toast({
        title: t('featureInDevelopment'),
        description: t('theSupplierDetailPageIsTemporarilyUnavailable'),
    });
  };
  
  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('suppliers')}</h1>
           <div className="flex items-center gap-2">
              <Button onClick={() => setIsAddSupplierDialogOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('newSupplier')}
              </Button>
          </div>
        </div>
        
        <Card>
          <CardHeader>
              <CardTitle>{t('allSuppliers')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {(suppliers || []).map((supplier) => (
                    <Card 
                        key={supplier.id} 
                        className="flex flex-col overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                        onClick={() => handleSupplierClick(supplier.id!)}
                    >
                        <CardHeader className="flex-row items-center gap-4 space-y-0 pb-4">
                            <div className="p-3 rounded-full bg-muted">
                                <Truck className="h-6 w-6 text-primary" />
                            </div>
                            <CardTitle className="text-lg font-semibold truncate flex-1">{supplier.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-2 text-sm">
                             <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('totalContractValue')}</span>
                                <span className="font-medium">{formatCurrency(0)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('pendingAmount')}</span>
                                <span className="font-semibold text-destructive">{formatCurrency(0)}</span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                </div>
            )}
            {!loading && (!suppliers || suppliers.length === 0) && (
                <div className="text-center py-10">
                    <p className="text-muted-foreground">{t('noSuppliersFound')}</p>
                    <p className="text-sm">{t('startByAddingANewSupplier')}</p>
                </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AddSupplierDialog
        open={isAddSupplierDialogOpen}
        onOpenChange={setIsAddSupplierDialogOpen}
        onAddSupplier={handleAddSupplier}
      />
    </>
  );
}
