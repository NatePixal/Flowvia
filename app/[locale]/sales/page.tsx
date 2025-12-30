
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FileDown, PlusCircle, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, doc, runTransaction, Timestamp, serverTimestamp, addDoc, deleteDoc, updateDoc, getDocs, where, limit, getDoc, DocumentReference, DocumentSnapshot, Firestore } from 'firebase/firestore';
import { Sale, Product, Client, ClientTransaction, Seller } from '@/lib/types';
import AddSaleDialog from '@/components/sales/add-sale-dialog';
import EditSaleDialog from '@/components/sales/edit-sale-dialog';
import DeleteSaleDialog from '@/components/sales/delete-sale-dialog';
import { useToast } from '@/hooks/use-toast';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { useCurrency, exchangeRates, BASE_CURRENCY } from '@/lib/currency-provider';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { exportToCSV } from '@/lib/csv-export';
import { hasPermission } from '@/lib/permissions';

export default function SalesPage() {
  const { t } = useTranslation();
  const { firestore, userProfile, user } = useFirebase();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [clientFilter, setClientFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [sellerFilter, setSellerFilter] = useState('all');

  const { data: sales, isLoading: loading } = useCompanyCollection<Sale>('sales');
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  
  const filteredSales = useMemo(() => {
    const getDateFromSale = (saleDate: string | Timestamp): Date => {
      if (saleDate instanceof Timestamp) {
        return saleDate.toDate();
      }
      return new Date(saleDate);
    };

    return (sales || [])
      .filter((sale) => {
        if (!dateRange?.from) return true;
        const saleDate = sale.date instanceof Timestamp ? sale.date.toDate() : new Date(sale.date);
        const from = dateRange.from;
        const to = dateRange.to || from; // If no 'to' date, use 'from' as a single day filter
        const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
        return saleDate >= from && saleDate <= toEndOfDay;
      })
      .filter((sale) => clientFilter === 'all' || sale.clientName === clientFilter)
      .filter((sale) => paymentFilter === 'all' || sale.paymentType === paymentFilter)
      .filter((sale) => sellerFilter === 'all' || sale.sellerId === sellerFilter)
      .sort((a, b) => getDateFromSale(b.date).getTime() - getDateFromSale(a.date).getTime());
  }, [sales, dateRange, clientFilter, paymentFilter, sellerFilter]);

  const formatDate = (date: string | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return d.toLocaleDateString();
  }

  const handleExport = () => {
    if (filteredSales.length > 0) {
      const dataToExport = filteredSales.map(s => ({
        [t('clientName')]: s.clientName,
        [t('product')]: s.productName,
        [t('productCode')]: s.productCode,
        [t('seller')]: s.sellerName,
        [t('warehouse')]: s.warehouse,
        [t('quantity')]: s.quantity,
        [t('salePrice')]: s.salePrice,
        [t('currency')]: s.salePriceCurrency,
        [t('total')]: s.total,
        [t('profit')]: s.grossProfit,
        [t('paymentType')]: t(s.paymentType.toLowerCase() as 'cash' | 'loan' | 'partial'),
        [t('date')]: formatDate(s.date),
      }));
      exportToCSV(dataToExport, 'sales_history.csv');
    } else {
      toast({
        variant: 'destructive',
        title: t('exportFailed'),
        description: t('noDataToExport'),
      });
    }
  };

  const handleAddSale = async (newSale: Omit<Sale, 'id' | 'createdAt'>) => {
    if (!firestore || !userProfile?.companyId) {
        toast({
            variant: "destructive",
            title: t('error'),
            description: t('firestoreNotAvailable'),
        });
        return;
    }

    try {
      await runTransaction(firestore, async (transaction) => {
        const productRef = doc(firestore, 'products', newSale.productCode);
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) {
             throw new Error(`${t('productWithCode')} "${newSale.productCode}" ${t('notFound')}.`);
        }
        
        const productData = productSnap.data() as Product;
        
        if (productData.quantity < newSale.quantity) {
          throw new Error(`${t('notEnoughStockFor')} ${productData.name}. ${t('available')}: ${productData.quantity}`);
        }
        
        const totalBase = newSale.total / exchangeRates[newSale.salePriceCurrency];
        const costOfGoodsSold = (productData.purchasePriceBase || 0) * newSale.quantity;
        const grossProfit = totalBase - costOfGoodsSold;


        // Add the new sale document
        const newSaleRef = doc(collection(firestore, 'sales'));
        transaction.set(newSaleRef, {
            ...newSale,
            companyId: userProfile.companyId,
            totalBase,
            costOfGoodsSold,
            grossProfit,
            warehouse: productData.location || 'N/A', // Save warehouse location
            date: newSale.date ? Timestamp.fromDate(new Date(newSale.date)) : serverTimestamp(),
            createdAt: serverTimestamp(),
            isDeleted: false,
        });
        
        // Update the product quantity and low stock status
        const newStock = productData.quantity - newSale.quantity;
        const minStock = productData.minStock || 0;
        
        transaction.update(productRef, {
          quantity: newStock,
          lowStock: newStock <= minStock,
          updatedAt: serverTimestamp(),
        });

        if (newSale.paymentType === 'Loan') {
          const client = (clients || []).find(c => c.name === newSale.clientName);
          if (!client || !client.id) {
            throw new Error(t('clientNotFoundForLoan'));
          }

          const transactionDoc: Omit<ClientTransaction, 'id' | 'companyId'> = {
            clientId: client.id,
            type: "Loan",
            amount: totalBase, // Use base currency amount for ledger
            relatedId: newSaleRef.id,
            createdAt: serverTimestamp(),
          };
          const newTransactionRef = doc(collection(firestore, "client_transactions"));
          transaction.set(newTransactionRef, { ...transactionDoc, companyId: userProfile.companyId });
        }
      });
      
      toast({
        title: t('saleRecorded'),
        description: t('inventoryUpdatedSuccessfully'),
      });
      setIsAddDialogOpen(false);

    } catch (e: any) {
      console.error(e);
      toast({
        variant: 'destructive',
        title: t('error'),
        description: e.message || t('couldNotRecordSale'),
      });
    }
  };

  const handleUpdateSale = async (saleId: string, updatedData: Partial<Sale>) => {
    if (!firestore || !selectedSale) return;

    try {
        await runTransaction(firestore, async (transaction) => {
            const saleRef = doc(firestore, 'sales', saleId);
            const saleSnap = await transaction.get(saleRef);
             if (!saleSnap.exists()) {
                throw new Error(t('saleOrProductNotFound'));
            }
            const originalSale = saleSnap.data() as Sale;

            const productRef = doc(firestore, 'products', originalSale.productCode);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
                // If product is not found, we can't adjust stock.
                // We'll just update the sale and log a warning.
                console.warn(`Product ${originalSale.productCode} not found. Updating sale without adjusting stock.`);
                transaction.update(saleRef, {
                    ...updatedData,
                    date: updatedData.date ? Timestamp.fromDate(new Date(updatedData.date as string)) : originalSale.date,
                });
                return;
            }
            const productData = productSnap.data() as Product;


            const quantityDifference = (updatedData.quantity || originalSale.quantity) - originalSale.quantity;

            const newStock = productData.quantity - quantityDifference;
            if (newStock < 0) {
                throw new Error(t('notEnoughStockForUpdate'));
            }
            
            const newTotal = (updatedData.quantity || originalSale.quantity) * (updatedData.salePrice || originalSale.salePrice);
            const newTotalInBase = newTotal / exchangeRates[updatedData.salePriceCurrency || originalSale.salePriceCurrency];
             const newCostOfGoodsSold = (productData.purchasePriceBase || 0) * (updatedData.quantity || originalSale.quantity);
            const newGrossProfit = newTotalInBase - newCostOfGoodsSold;
            
            transaction.update(productRef, {
                quantity: newStock,
                lowStock: newStock <= (productData.minStock || 0),
                updatedAt: serverTimestamp(),
            });

            transaction.update(saleRef, {
                ...updatedData,
                date: updatedData.date ? Timestamp.fromDate(new Date(updatedData.date as string)) : originalSale.date,
                total: newTotal,
                totalBase: newTotalInBase,
                costOfGoodsSold: newCostOfGoodsSold,
                grossProfit: newGrossProfit,
            });
        });
        toast({ title: t('saleUpdated'), description: t('saleAndInventoryUpdated') });
        setIsEditDialogOpen(false);
        setSelectedSale(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: t('error'), description: e.message });
    }
  };

  const handleDeleteSale = async () => {
    if (!firestore || !selectedSale?.id || !user?.uid || !userProfile?.companyId) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: t('The selected sale is missing required information and cannot be deleted.'),
      });
      setIsDeleteDialogOpen(false);
      return;
    }
  
    const saleRef = doc(firestore, 'sales', selectedSale.id);
  
    try {
        await runTransaction(firestore, async (transaction) => {
            const saleSnap = await transaction.get(saleRef);
            if (!saleSnap.exists() || saleSnap.data().isDeleted) {
                return;
            }
            const saleToDelete = saleSnap.data() as Sale;

            // Soft delete the sale document
            transaction.update(saleRef, {
                isDeleted: true,
                deletedAt: serverTimestamp(),
                deletedBy: user.uid,
            });

            const productRef = doc(firestore, 'products', saleToDelete.productCode);
            const productSnap = await transaction.get(productRef);
            if (productSnap.exists()) {
                const productData = productSnap.data() as Product;
                const newStock = productData.quantity + saleToDelete.quantity;
                transaction.update(productRef, {
                    quantity: newStock,
                    lowStock: newStock <= (productData.minStock || 0),
                });
            } else {
                console.warn(`Product ${saleToDelete.productCode} not found for stock reversion during sale deletion.`);
            }

            if (saleToDelete.paymentType === 'Loan' && userProfile?.companyId) {
                 const clientTransactionQuery = query(
                    collection(firestore, 'client_transactions'),
                    where('relatedId', '==', saleToDelete.id),
                    where('type', '==', 'Loan'),
                    where('companyId', '==', userProfile.companyId),
                    limit(1)
                );
                const txSnapshot = await getDocs(clientTransactionQuery);
                if (!txSnapshot.empty) {
                    const txDoc = txSnapshot.docs[0];
                    transaction.delete(txDoc.ref);
                }
            }
        });
  
      toast({ title: t('saleDeleted'), description: t('The sale has been deleted and inventory has been restored.') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message });
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedSale(null);
    }
  };
  
  const openEditDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsDeleteDialogOpen(true);
  };
  
  const formatWithCurrency = (price: number, priceCurrency: string) => {
    const currencyCode = priceCurrency && exchangeRates[priceCurrency as keyof typeof exchangeRates] ? priceCurrency : BASE_CURRENCY;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('salesHistory')}</h1>
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport}>
                  <FileDown className="mr-2 h-4 w-4" />
                  {t('export')}
              </Button>
              {hasPermission(userProfile, 'sales', 'create') && (
                <Button onClick={() => setIsAddDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('recordSale')}
                </Button>
              )}
          </div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>{t('allSales')}</CardTitle>
              <div className="flex gap-2 flex-wrap">
                  <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                      <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder={t('filterByClient')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">{t('allClients')}</SelectItem>
                          {[...new Set((sales || []).map(s => s.clientName))].filter(name => !!name).map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                      </SelectContent>
                  </Select>
                   <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                      <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder={t('filterByPayment')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">{t('all')}</SelectItem>
                          <SelectItem value="Cash">{t('cash')}</SelectItem>
                          <SelectItem value="Loan">{t('loan')}</SelectItem>
                          <SelectItem value="Partial">{t('partial')}</SelectItem>
                      </SelectContent>
                  </Select>
                  <Select value={sellerFilter} onValueChange={setSellerFilter}>
                      <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder={t('filterBySeller')} />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">{t('allSellers')}</SelectItem>
                          {(sellers || []).map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
                      </SelectContent>
                  </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <p>{t('loading')}...</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="truncate">{t('clientName')}</TableHead>
                  <TableHead className="truncate">{t('product')}</TableHead>
                  <TableHead className="text-right">{t('quantity')}</TableHead>
                  <TableHead className="text-center">{t('paymentType')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                  <TableHead className="text-right">{t('profit')}</TableHead>
                  <TableHead className="text-right">{t('date')}</TableHead>
                  <TableHead className="text-center">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium truncate">{sale.clientName}</TableCell>
                    <TableCell className="truncate">{sale.productName}</TableCell>
                    <TableCell className="text-right">{sale.quantity}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={sale.paymentType === 'Loan' ? 'destructive' : 'secondary'}>{t(sale.paymentType.toLowerCase() as 'cash' | 'loan' | 'partial')}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatWithCurrency(sale.total, sale.salePriceCurrency)}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">{formatCurrency(sale.grossProfit || 0)}</TableCell>
                    <TableCell className="text-right">{formatDate(sale.date)}</TableCell>
                    <TableCell className="text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">{t('openMenu')}</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(sale)}>
                            {t('edit')}
                          </DropdownMenuItem>
                           {hasPermission(userProfile, 'sales', 'refund') && (
                            <DropdownMenuItem onClick={() => openDeleteDialog(sale)} className="text-destructive">
                              {t('delete')}
                            </DropdownMenuItem>
                           )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <AddSaleDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddSale={handleAddSale}
      />
      {selectedSale && (
        <EditSaleDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          sale={selectedSale}
          onUpdateSale={handleUpdateSale}
          clients={clients || []}
          products={products || []}
          sellers={sellers || []}
        />
      )}
      {selectedSale && (
        <DeleteSaleDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteSale}
        />
      )}
    </>
  );
}
