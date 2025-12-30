
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, addDoc, serverTimestamp, doc, updateDoc, orderBy } from 'firebase/firestore';
import type { Seller, Sale } from '@/lib/types';
import AddSellerDialog from '@/components/sellers/add-seller-dialog';
import EditSellerDialog from '@/components/sellers/edit-seller-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/lib/currency-provider';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';

type AggregatedSeller = {
  id: string;
  name: string;
  contact?: string;
  status: 'active' | 'inactive';
  totalSales: number;
  totalRevenue: number; // in base currency
  totalQuantity: number;
}

export default function SellersPage() {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);

  const { data: sellers, isLoading: sellersLoading } = useCompanyCollection<Seller>('sellers');
  const { data: sales, isLoading: salesLoading } = useCompanyCollection<Sale>('sales');

  const aggregatedSellers = useMemo(() => {
    const sellerMap = new Map<string, AggregatedSeller>();

    (sellers || []).forEach(s => {
      sellerMap.set(s.id!, {
        ...s,
        totalSales: 0,
        totalRevenue: 0,
        totalQuantity: 0,
      });
    });

    (sales || []).forEach(sale => {
      if (sale.sellerId) {
        const seller = sellerMap.get(sale.sellerId);
        if (seller) {
          seller.totalSales += 1;
          seller.totalRevenue += sale.totalBase || 0;
          seller.totalQuantity += sale.quantity;
        }
      }
    });

    return Array.from(sellerMap.values());
  }, [sellers, sales]);

  const handleAddSeller = async (sellerData: Omit<Seller, 'id' | 'createdAt' | 'companyId'>) => {
    if (!firestore || !userProfile?.companyId) return;
    try {
      await addDoc(collection(firestore, 'sellers'), {
        ...sellerData,
        companyId: userProfile.companyId,
        createdAt: serverTimestamp(),
      });
      toast({ title: t('sellerAdded'), description: `${sellerData.name} ${t('hasBeenAdded')}` });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotAddSeller') });
    }
  };

  const handleUpdateSeller = async (sellerId: string, sellerData: Partial<Seller>) => {
    if (!firestore) return;
    try {
      const sellerRef = doc(firestore, 'sellers', sellerId);
      await updateDoc(sellerRef, sellerData);
      toast({ title: t('sellerUpdated'), description: t('sellerInfoUpdated') });
      setIsEditDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateSeller') });
    }
  }
  
  const openEditDialog = (seller: Seller) => {
    setSelectedSeller(seller);
    setIsEditDialogOpen(true);
  };

  const isLoading = sellersLoading || salesLoading;

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('sellerManagement')}</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('addSeller')}
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('sellerList')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p>{t('loading')}...</p>}
            {!isLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sellerName')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-right">{t('totalSalesCount')}</TableHead>
                    <TableHead className="text-right">{t('totalRevenue')}</TableHead>
                    <TableHead className="text-right">{t('totalQuantitySold')}</TableHead>
                    <TableHead className="text-center">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedSellers.map((seller) => (
                    <TableRow key={seller.id}>
                      <TableCell className="font-medium">{seller.name}</TableCell>
                      <TableCell>
                        <Badge variant={seller.status === 'active' ? 'default' : 'secondary'} className={seller.status === 'active' ? 'bg-green-500/20 text-green-700 border-green-500/30' : ''}>
                          {t(seller.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{seller.totalSales}</TableCell>
                      <TableCell className="text-right">{formatCurrency(seller.totalRevenue)}</TableCell>
                      <TableCell className="text-right">{seller.totalQuantity}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(seller as Seller)}>
                                {t('edit')}
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <AddSellerDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddSeller={handleAddSeller}
      />
      {selectedSeller && (
        <EditSellerDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            seller={selectedSeller}
            onUpdateSeller={handleUpdateSeller}
        />
      )}
    </>
  );
}
