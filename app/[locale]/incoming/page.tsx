
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, Upload, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { collection, query, doc, runTransaction, serverTimestamp, addDoc, orderBy, Timestamp, deleteDoc, getDoc } from 'firebase/firestore';
import type { Product, IncomingProductLog, Supplier } from '@/lib/types';
import AddIncomingProductDialog from '@/components/incoming/add-incoming-product-dialog';
import EditIncomingLogDialog from '@/components/incoming/edit-incoming-log-dialog';
import DeleteIncomingLogDialog from '@/components/incoming/delete-incoming-log-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { importIncomingProducts } from '@/lib/csv-import';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency-provider';

export default function IncomingPage() {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { formatCurrency } = useCurrency();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<IncomingProductLog | null>(null);

  const { toast } = useToast();
  const [isImporting, setIsImporting] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const { data: products } = useCompanyCollection<Product>('products');
  const { data: suppliers } = useCompanyCollection<Supplier>('suppliers');
  const { data: incomingProducts, isLoading: loading, error } = useCompanyCollection<IncomingProductLog>('incomingProducts');
  
  const filteredIncomingProducts = useMemo(() => {
    return (incomingProducts || []).filter((log) => {
      if (!dateRange?.from) return true;
      const logDate = log.date instanceof Timestamp ? log.date.toDate() : new Date(log.date);
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return logDate >= from && logDate <= toEndOfDay;
    });
  }, [incomingProducts, dateRange]);

  const formatDate = (date: string | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return format(d, 'yyyy-MM-dd');
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && firestore && userProfile?.companyId) {
      setIsImporting(true);
      try {
        await importIncomingProducts(file, firestore, userProfile.companyId);
        toast({
          title: t('importSuccessful'),
          description: t('incomingProductsFromFileImported'),
        });
      } catch (error) {
        console.error('Import failed:', error);
        toast({
          variant: 'destructive',
          title: t('importFailed'),
          description: error instanceof Error ? error.message : t('unknownErrorOccurred'),
        });
      } finally {
        setIsImporting(false);
        // Reset file input to allow re-uploading the same file
        if (event.target) {
            event.target.value = '';
        }
      }
    }
  };


  const handleAddIncomingProduct = async (data: {
    productCode: string;
    productName: string;
    category: string;
    quantity: number;
    cost: number;
    supplier: string;
    location: string;
    minStock: number;
  }) => {
    if (!firestore || !userProfile?.companyId) {
      toast({ variant: 'destructive', title: t('error'), description: t('firestoreNotAvailable') });
      return;
    }
    const productCode = data.productCode.toUpperCase().trim();

    if (!productCode || data.quantity <= 0) {
      toast({ variant: 'destructive', title: t('error'), description: t('invalidIncomingProductData') });
      return;
    }

    const productRef = doc(firestore, "products", productCode);

    try {
      await runTransaction(firestore, async (transaction) => {
        const productSnap = await transaction.get(productRef);

        if (!productSnap.exists()) {
          // Product does not exist, create it
          const newStock = data.quantity;
          transaction.set(productRef, {
            productCode: productCode,
            companyId: userProfile.companyId,
            name: data.productName || `Product ${productCode}`,
            category: data.category || 'Uncategorized',
            quantity: newStock,
            cost: data.cost, // Initial cost
            supplier: data.supplier || '',
            location: data.location || '',
            minStock: data.minStock || 0,
            lowStock: newStock <= (data.minStock || 0),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            sellingPrice: 0,
            purchasePrice: data.cost,
            purchasePriceCurrency: 'USD', // Default currency
            sellingPriceCurrency: 'USD', // Default currency
            isDeleted: false,
          });
        } else {
          // Product exists, update it
          const existingData = productSnap.data() as Product;
          const oldStock = existingData.quantity || 0;
          const oldAvgCost = existingData.cost || 0;
          const minStock = existingData.minStock || 0;

          const newStock = oldStock + data.quantity;
          // Calculate new average cost
          const newAvgCost = newStock > 0 ? (oldStock * oldAvgCost + data.quantity * data.cost) / newStock : data.cost;
          
          transaction.update(productRef, {
            quantity: newStock,
            cost: newAvgCost, // Update average cost
            supplier: data.supplier || existingData.supplier,
            location: data.location || existingData.location,
            minStock: data.minStock || existingData.minStock,
            lowStock: newStock <= (data.minStock || minStock),
            updatedAt: serverTimestamp(),
          });
        }
      });
      
      // These logs are outside the transaction and will run after it succeeds.
      const incomingLogRef = collection(firestore, "incomingProducts");
      await addDoc(incomingLogRef, {
          productCode: productCode,
          companyId: userProfile.companyId,
          quantity: data.quantity,
          unitCost: data.cost,
          totalCost: data.quantity * data.cost,
          date: serverTimestamp(),
          supplier: data.supplier,
          isDeleted: false,
      });

      const inventoryLogRef = collection(firestore, "inventoryLogs");
      await addDoc(inventoryLogRef, {
          productId: productCode,
          productCode: productCode,
          companyId: userProfile.companyId,
          changeQuantity: data.quantity,
          changeDate: serverTimestamp(),
          reason: `Incoming stock from supplier: ${data.supplier || 'N/A'}.`,
          isDeleted: false,
      });

      toast({
            title: t('productUpdated'),
            description: `${t('added')} ${data.quantity} ${t('toStockFor')} ${productCode}.`,
        });

      setIsAddDialogOpen(false);
      
    } catch (e: any) {
      console.error('Transaction failed: ', e);
      toast({
        variant: 'destructive',
        title: t('error'),
        description: e.message || t('couldNotRecordIncomingProduct'),
      });
    }
  };

  const handleEditIncomingLog = async (logId: string, updatedData: { quantity: number; unitCost: number; supplier: string }) => {
    if (!firestore || !selectedLog) {
      toast({ variant: 'destructive', title: t('error'), description: t('firestoreNotAvailable') });
      return;
    }

    const logRef = doc(firestore, 'incomingProducts', logId);
    const productRef = doc(firestore, 'products', selectedLog.productCode);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) {
                throw new Error(t('productNotFound'));
            }
            const productData = productSnap.data() as Product;

            // 1. Reverse the old transaction from product stats
            const oldStock = productData.quantity;
            const oldTotalValue = (productData.cost || 0) * oldStock;
            const oldLogTotalCost = selectedLog.quantity * (selectedLog.unitCost || 0);
            
            let stockAfterReversal = oldStock - selectedLog.quantity;
            if (stockAfterReversal < 0) {
              console.warn("Stock becomes negative after reversal. Clamping to 0.");
              stockAfterReversal = 0;
            }
            
            const valueAfterReversal = oldTotalValue - oldLogTotalCost;
            const avgCostAfterReversal = stockAfterReversal > 0 ? valueAfterReversal / stockAfterReversal : 0;
            
            // 2. Apply the new transaction to product stats
            const newStock = stockAfterReversal + updatedData.quantity;
            const newTotalValue = (avgCostAfterReversal * stockAfterReversal) + (updatedData.quantity * updatedData.unitCost);
            const newAvgCost = newStock > 0 ? newTotalValue / newStock : 0;
            
            transaction.update(productRef, {
                quantity: newStock,
                cost: newAvgCost,
                lowStock: newStock <= (productData.minStock || 0),
                updatedAt: serverTimestamp(),
            });

            // 3. Update the incoming log itself
            transaction.update(logRef, {
                ...updatedData,
                totalCost: updatedData.quantity * updatedData.unitCost,
                date: serverTimestamp(), // Mark as updated now
            });
        });

        toast({ title: t('updateSuccessful'), description: t('incomingLogAndStockUpdated') });
        setIsEditDialogOpen(false);
        setSelectedLog(null);
    } catch (e: any) {
        console.error('Edit transaction failed:', e);
        toast({ variant: 'destructive', title: t('error'), description: e.message });
    }
  };

  const handleDeleteIncomingLog = async () => {
      if (!firestore || !selectedLog) {
          toast({ variant: 'destructive', title: t('error'), description: t('logOrDbNotAvailable') });
          return;
      }
      const logRef = doc(firestore, 'incomingProducts', selectedLog.id);
      const productRef = doc(firestore, 'products', selectedLog.productCode);
      
      try {
          await runTransaction(firestore, async (transaction) => {
              const productSnap = await transaction.get(productRef);
              if (!productSnap.exists()) {
                  transaction.delete(logRef);
                  return;
              }
              const productData = productSnap.data() as Product;

              const oldStock = productData.quantity;
              const oldTotalValue = (productData.cost || 0) * oldStock;
              const logTotalCost = selectedLog.quantity * (selectedLog.unitCost || 0);
              
              let newStock = oldStock - selectedLog.quantity;
              if (newStock < 0) newStock = 0;

              const newValue = oldTotalValue - logTotalCost;
              const newAvgCost = newStock > 0 ? newValue / newStock : 0;
             
              transaction.update(productRef, {
                  quantity: newStock,
                  cost: newAvgCost < 0 ? 0 : newAvgCost,
                  lowStock: newStock <= (productData.minStock || 0),
                  updatedAt: serverTimestamp(),
              });

              transaction.delete(logRef);
          });
          toast({ title: t('deleteSuccessful'), description: t('incomingLogDeleted') });
          setIsDeleteDialogOpen(false);
          setSelectedLog(null);
      } catch (e: any) {
          console.error('Delete transaction failed:', e);
          toast({ variant: 'destructive', title: t('error'), description: e.message });
      }
  };

  const openEditDialog = (log: IncomingProductLog) => {
    setSelectedLog(log);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (log: IncomingProductLog) => {
    setSelectedLog(log);
    setIsDeleteDialogOpen(true);
  };
  
  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('dailyIncomingProducts')}</h1>
          <div className="flex items-center gap-2">
               <Button asChild variant="outline">
                <label htmlFor="file-upload">
                  <Upload className="mr-2 h-4 w-4" />
                  {isImporting ? t('importing') : t('importFile')}
                  <input id="file-upload" type="file" accept=".csv,.xlsx" className="sr-only" onChange={handleFileChange} disabled={isImporting} />
                </label>
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('addIncomingProduct')}
              </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>{t('incomingProductLog')}</CardTitle>
               <div className="flex gap-2 flex-wrap">
                  <DateRangePicker date={dateRange} onDateChange={setDateRange} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading && <p>{t('loading')}...</p>}
            {error && <p className="text-destructive">{t('error')}: {error.message}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('productCode')}</TableHead>
                  <TableHead className="truncate">{t('supplier')}</TableHead>
                  <TableHead className="text-right">{t('quantity')}</TableHead>
                  <TableHead className="text-right">{t('unitCost')}</TableHead>
                  <TableHead className="text-right">{t('totalCost')}</TableHead>
                  <TableHead className="text-right">{t('arrivalDate')}</TableHead>
                  <TableHead className="text-center">{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredIncomingProducts.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.productCode}</TableCell>
                    <TableCell className="truncate">{log.supplier}</TableCell>
                    <TableCell className="text-right">{log.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(log.unitCost || 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(log.totalCost)}</TableCell>
                    <TableCell className="text-right">{formatDate(log.date)}</TableCell>
                    <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">{t('openMenu')}</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(log)}>
                              {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteDialog(log)} className="text-destructive">
                              {t('delete')}
                            </DropdownMenuItem>
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
      <AddIncomingProductDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddIncomingProduct={handleAddIncomingProduct}
        products={products || []}
        suppliers={suppliers || []}
      />
      {selectedLog && (
        <EditIncomingLogDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            log={selectedLog}
            onEditLog={handleEditIncomingLog}
            suppliers={suppliers || []}
        />
      )}
      {selectedLog && (
        <DeleteIncomingLogDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirm={handleDeleteIncomingLog}
        />
      )}
    </>
  );
}
