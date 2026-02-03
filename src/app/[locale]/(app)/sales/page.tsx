
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, FileDown, ListFilter, Edit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { collection, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, runTransaction, Timestamp, getDocs, getDoc, query, where, deleteField, orderBy, FieldValue, writeBatch } from 'firebase/firestore';
import type { Sale, Product, Client, Seller, ClientLedgerEntry, FxSnapshot, Currency, UserProfile } from '@/lib/types';
import AddSaleDialog from '@/components/sales/add-sale-dialog';
import DeleteSaleDialog from '@/components/sales/delete-sale-dialog';
import EditSaleDialog from '@/components/sales/edit-sale-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { format } from 'date-fns';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { toMinor, fromMinor, formatMoneyMinor, convertMinorToBase, convertBaseToMinor } from '@/lib/money';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { hasPermission } from '@/lib/permissions';
import { FancyCard } from '@/components/ui/fancy-card';
import { recomputeClientOutstanding } from '@/lib/ledger-recompute';
import { Input } from '@/components/ui/input';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { useCompanyUsers } from '@/hooks/use-company-users';

type DateInput = string | Date | Timestamp | FieldValue | null | undefined;

const safeGetDate = (value: DateInput): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Ignore FieldValue sentinels (serverTimestamp) and any unexpected shapes safely
  if (typeof value === 'object' && value && typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
};

const normalizePaymentType = (v: any): 'Cash' | 'Partial' | 'Loan' => {
  const s = String(v ?? '').trim().toLowerCase();
  if (['loan', 'credit', 'debt', 'qarz', 'nasiya', 'кредит', 'долг', 'займ', 'заем'].some(k => s.includes(k))) return 'Loan';
  if (['partial', 'part', 'avans', 'advance', 'предоплат', 'аванс', 'частич'].some(k => s.includes(k))) return 'Partial';
  if (['cash', 'full', 'paid', 'налич', 'naqd', 'to‘liq', "to'liq"].some(k => s.includes(k))) return 'Cash';
  return 'Cash';
};

const extractPaidAtSaleMajor = (saleData: any): number => {
  const candidates = [ saleData?.paidAtSale, saleData?.paidAmount, saleData?.amountPaid, saleData?.paid, saleData?.downPayment, saleData?.advancePayment ];
  const raw = candidates.find(v => v !== undefined && v !== null && v !== '');
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

type SortKey = 'createdAt' | 'clientName' | 'productName' | 'quantity' | 'revenueMinor';


export default function SalesPage() {
  const { t } = useTranslation();
  const { firestore, companyId, user, userProfile, companyBaseCurrency } = useFirebase();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Filters and sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  const salesOrder = useMemo(() => orderBy('createdAt', 'desc'), []);
  const { data: sales, loading: salesLoading } = useCompanyCollection<Sale>('sales', ...[salesOrder]);
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  const { users: companyUsers } = useCompanyUsers();
  const canExport = hasPermission(userProfile, 'sales', 'export');
  const canDelete = hasPermission(userProfile, 'sales', 'delete'); // Admin or Developer

  const filteredAndSortedSales = useMemo(() => {
    let filtered = (sales || []).filter(s => !s.isDeleted);

    // Date range filter
    if (dateRange?.from) {
        const to = dateRange.to ? new Date(dateRange.to.setHours(23, 59, 59, 999)) : new Date(dateRange.from.setHours(23, 59, 59, 999));
        filtered = filtered.filter(sale => {
            const saleDate = safeGetDate(sale.date);
            return saleDate && saleDate >= dateRange.from! && saleDate <= to;
        });
    }
    
    // Search term filter
    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      filtered = filtered.filter(sale =>
        sale.clientName?.toLowerCase().includes(lowercasedFilter) ||
        sale.productName?.toLowerCase().includes(lowercasedFilter) ||
        sale.productCode?.toLowerCase().includes(lowercasedFilter)
      );
    }
    
    // Sorting
    return filtered.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        let comparison = 0;
        if (aValue instanceof Timestamp && bValue instanceof Timestamp) {
            comparison = aValue.toMillis() - bValue.toMillis();
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
            comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
            comparison = aValue.localeCompare(bValue);
        } else if (aValue instanceof Date && bValue instanceof Date) {
            comparison = aValue.getTime() - bValue.getTime();
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

  }, [sales, searchTerm, dateRange, sortConfig]);

  const handleAddSale = async (saleData: any) => {
    if (!firestore || !companyId || !companyBaseCurrency) {
        toast({
            variant: 'destructive',
            title: t('toast.error.title'),
            description: t('toast.error.companyIdMissingError'),
        });
        return;
    }

    const { clientId, productId, quantity, salePrice, salePriceCurrency, paymentType, date, sellerId, fx } = saleData;

    const productRef = companyDoc(firestore, companyId, `products/${productId}`);
    const clientRef = companyDoc(firestore, companyId, `clients/${clientId}`);
    const saleCollectionRef = companyCollection(firestore, companyId, 'sales');
    const clientLedgerCollectionRef = companyCollection(firestore, companyId, `clients/${clientId}/ledger`);

    try {
        await runTransaction(firestore, async (transaction) => {
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists()) throw new Error(t('toast.error.productNotFound'));
            const productData = productSnap.data() as Product;

            if (productData.quantity < quantity) throw new Error(t('toast.error.notEnoughStock'));

            const revenueMinor = toMinor(salePrice * quantity, salePriceCurrency);
            if (!Number.isInteger(revenueMinor)) throw new Error("Invalid revenue calculation.");

            let revenueBaseMinor: number;
            if (salePriceCurrency === companyBaseCurrency) {
              revenueBaseMinor = revenueMinor;
            } else {
              if (!fx) throw new Error("FX data is required for cross-currency transaction.");
              revenueBaseMinor = convertMinorToBase(revenueMinor, fx.rateToBase, salePriceCurrency, companyBaseCurrency);
            }
            if (!Number.isInteger(revenueBaseMinor)) throw new Error("Invalid base revenue calculation.");
            
            let unitCostBaseMinor = productData.costBaseMinor;
            if (unitCostBaseMinor === undefined) {
              throw new Error(t('toast.error.productCostError', {productCode: productData.productCode}));
            }
            const costOfGoodsSoldBaseMinor = unitCostBaseMinor * quantity;
            if (!Number.isInteger(costOfGoodsSoldBaseMinor)) throw new Error("Invalid COGS calculation.");
            
            const grossProfitBaseMinor = revenueBaseMinor - costOfGoodsSoldBaseMinor;
            
            let costOfGoodsSoldMinor = 0;
            if(salePriceCurrency === companyBaseCurrency) {
                costOfGoodsSoldMinor = costOfGoodsSoldBaseMinor;
            } else if (fx) {
                costOfGoodsSoldMinor = convertBaseToMinor(costOfGoodsSoldBaseMinor, fx.rateToBase, salePriceCurrency, companyBaseCurrency);
            }
            const grossProfitMinor = revenueMinor - costOfGoodsSoldMinor;

            const newQuantity = productData.quantity - quantity;
            transaction.update(productRef, {
                quantity: newQuantity,
                lowStock: newQuantity <= (productData.minStock || 0)
            });

            const paymentTypeCanonical = normalizePaymentType(paymentType);

            const salePayload: Omit<Sale, 'id'> = {
                ...withCompanyId(companyId, {}),
                clientId, productId, quantity, salePrice, salePriceCurrency, paymentType: paymentTypeCanonical, date: Timestamp.fromDate(date), sellerId,
                clientName: clients.find(c => c.id === clientId)?.name || 'N/A',
                productName: productData.name,
                productCode: productData.productCode,
                sellerName: sellers.find(s => s.id === sellerId)?.name || 'N/A',
                baseCurrency: companyBaseCurrency,
                createdAt: serverTimestamp(),
                createdBy: user?.uid,
                isDeleted: false,
                revenueMinor, costOfGoodsSoldMinor, grossProfitMinor,
                revenueBaseMinor, costOfGoodsSoldBaseMinor, grossProfitBaseMinor,
                ...(fx ? {fx} : {})
            };
            const newSaleDocRef = doc(saleCollectionRef);
            transaction.set(newSaleDocRef, salePayload);

            const paidAtSaleMajor = extractPaidAtSaleMajor(saleData);
            const paidAtSaleMinorRaw = paymentTypeCanonical === 'Cash' ? revenueMinor : paymentTypeCanonical === 'Partial' ? toMinor(paidAtSaleMajor, salePriceCurrency) : 0;
            const paidAtSaleMinor = Math.max(0, Math.min(revenueMinor, paidAtSaleMinorRaw));
            const dueMinor = Math.max(0, revenueMinor - paidAtSaleMinor);

            const ledgerDocId = `sale_${newSaleDocRef.id}`;
            transaction.set(
              doc(clientLedgerCollectionRef, ledgerDocId),
              withCompanyId(companyId, {
                clientId, type: 'purchase', currency: salePriceCurrency, totalMinor: revenueMinor,
                paidMinor: paidAtSaleMinor, dueMinor, relatedSaleId: newSaleDocRef.id, createdAt: serverTimestamp(),
                note: `Sale of ${quantity} x ${productData.name} (${paymentTypeCanonical})`,
                items: [{ productId, name: productData.name, qty: quantity, unitPriceMinor: toMinor(salePrice, salePriceCurrency), lineTotalMinor: revenueMinor }],
              })
            );

            transaction.update(clientRef, { companyId, lastActivityAt: serverTimestamp() });
        });

        await recomputeClientOutstanding(firestore, companyId, clientId);
        toast({ title: t('toast.success.saleRecorded'), description: t('toast.success.saleRecordedSuccessMessage') });
        setIsAddDialogOpen(false);

    } catch (e: any) {
        console.error('[handleAddSale] Failed to record sale:', e);
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  };

  const handleUpdateSale = async (saleId: string, updatedData: any) => {
    if (!firestore || !companyId || !companyBaseCurrency || !user) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: 'An unexpected error occurred. Missing context.'});
        return;
    }

    const { quantity, salePrice, salePriceCurrency, fx, ...rest } = updatedData;
    const saleRef = companyDoc(firestore, companyId, `sales/${saleId}`);

    try {
      await runTransaction(firestore, async (transaction) => {
        const saleSnap = await transaction.get(saleRef);
        if (!saleSnap.exists()) throw new Error("Sale not found.");
        const oldSale = saleSnap.data() as Sale;

        const productRef = companyDoc(firestore, companyId, oldSale.productId);
        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) throw new Error("Product not found.");
        const productData = productSnap.data() as Product;

        // Recalculate all financials from scratch
        const revenueMinor = toMinor(salePrice * quantity, salePriceCurrency);
        
        let revenueBaseMinor: number;
        if (salePriceCurrency === companyBaseCurrency) {
          revenueBaseMinor = revenueMinor;
        } else {
          if (!fx?.rateToBase) throw new Error("FX rate is required for cross-currency sales.");
          revenueBaseMinor = convertMinorToBase(revenueMinor, fx.rateToBase, salePriceCurrency, companyBaseCurrency);
        }

        const costOfGoodsSoldBaseMinor = (productData.costBaseMinor ?? 0) * quantity;
        const grossProfitBaseMinor = revenueBaseMinor - costOfGoodsSoldBaseMinor;

        let costOfGoodsSoldMinor: number;
        if (salePriceCurrency === companyBaseCurrency) {
          costOfGoodsSoldMinor = costOfGoodsSoldBaseMinor;
        } else {
          if (!fx?.rateToBase) throw new Error("FX rate is required for cross-currency sales.");
          costOfGoodsSoldMinor = convertBaseToMinor(costOfGoodsSoldBaseMinor, fx.rateToBase, salePriceCurrency, companyBaseCurrency);
        }
        
        const grossProfitMinor = revenueMinor - costOfGoodsSoldMinor;

        // Update inventory
        const deltaQty = quantity - oldSale.quantity;
        const newStock = productData.quantity - deltaQty;
        if (newStock < 0) throw new Error("Not enough stock for this edit.");
        transaction.update(productRef, { quantity: newStock, lowStock: newStock <= (productData.minStock || 0) });
        
        // Update sale
        transaction.update(saleRef, {
            ...rest,
            quantity, salePrice, salePriceCurrency,
            fx: fx || deleteField(),
            revenueMinor, revenueBaseMinor, costOfGoodsSoldBaseMinor, grossProfitBaseMinor, grossProfitMinor,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
            repairVersion: "ui-edit-v1",
        });

      });
      
      toast({ title: t('toast.success.saleUpdated'), description: t('toast.success.saleUpdatedSuccessMessage') });

    } catch (e: any) {
        console.error("Failed to update sale:", e);
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
        throw e;
    }
  };

  const handleAdminHardDelete = async (saleToDelete: Sale) => {
    if (!firestore || !companyId || !user || !canDelete) return;

    const saleRef = companyDoc(firestore, companyId, `sales/${saleToDelete.id}`);
    const productRef = companyDoc(firestore, companyId, `products/${saleToDelete.productId}`);
    const deletedSalesRef = companyCollection(firestore, companyId, `deletedSales`);
    
    try {
        await runTransaction(firestore, async (transaction) => {
            const saleDoc = await transaction.get(saleRef);
            if (!saleDoc.exists()) throw new Error("Sale already deleted.");

            const productDoc = await transaction.get(productRef);
            if (productDoc.exists()) {
                const currentQty = productDoc.data().quantity || 0;
                transaction.update(productRef, { quantity: currentQty + saleToDelete.quantity });
            }

            const archiveData = {
                ...saleToDelete,
                deletedAt: serverTimestamp(),
                deletedBy: user.uid,
            }
            transaction.set(doc(deletedSalesRef, saleToDelete.id), archiveData);
            transaction.delete(saleRef);
        });

        toast({ title: t('toast.success.saleDeleted'), description: t('toast.success.saleRevertedAndStockAdjusted') });
        setIsDeleteDialogOpen(false);
        setSelectedSale(null);

    } catch (e: any) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleExport = () => {
    if (!canExport) {
        toast({
            variant: 'destructive',
            title: t('toast.error.accessDenied'),
            description: 'You are not allowed to export data.',
        });
        return;
    }
    if (!filteredAndSortedSales || filteredAndSortedSales.length === 0) {
      toast({
        variant: 'destructive',
        title: t('toast.error.noDataToExport'),
        description: t('toast.error.thereAreNoSalesToExport')
      });
      return;
    }
    
    const usersById = new Map(companyUsers.map((u) => [u.id, u]));

    exportToXlsx(
      `sales_${companyId}_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      t('sales.pageTitle'),
      filteredAndSortedSales,
      [
        { header: t('sales.date'), value: (r) => safeGetDate(r.date ?? r.createdAt) },
        { header: t('sales.productCode'), value: (r) => r.productCode },
        { header: t('sales.productName'), value: (r) => r.productName },
        { header: t('sales.clientName'), value: (r) => r.clientName },
        { header: t('sales.seller'), value: (r) => r.sellerName },
        { header: "Created By", value: (r) => usersById.get(r.createdBy!)?.name ?? r.createdBy ?? "" },
        { header: t('sales.paymentType'), value: (r) => r.paymentType },
        { header: t('sales.quantity'), value: (r) => r.quantity },
        { header: t('sales.total'), value: (r) => fromMinor(r.revenueMinor ?? 0, r.salePriceCurrency as Currency) },
        { header: t('sales.currency'), value: (r) => r.salePriceCurrency },
        { header: t('sales.grossProfit'), value: (r) => fromMinor(r.grossProfitMinor ?? 0, r.salePriceCurrency as Currency) },
      ]
    );
  };

  const openEditDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsEditDialogOpen(true);
  }

  const openDeleteDialog = (sale: Sale) => {
    setSelectedSale(sale);
    setIsDeleteDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('sales.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('sales.pageDescription')}</p>
          </div>
           <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
             {canExport && <Button variant="outline" onClick={handleExport}><FileDown className="mr-2 h-4 w-4" />{t('sales.export')}</Button>}
             <Button onClick={() => setIsAddDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />{t('sales.recordSale')}</Button>
           </div>
        </div>
        
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>{t('sales.filters')}</CardTitle>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input 
                            placeholder={t('sales.searchPlaceholder')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="max-w-xs"
                        />
                        <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline"><ListFilter className="mr-2 h-4 w-4" />{t('sales.sortBy')}</Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{t('sales.sortBy')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuRadioGroup value={`${sortConfig.key}-${sortConfig.direction}`} onValueChange={(v) => {
                                    const [key, direction] = v.split('-') as [SortKey, 'asc' | 'desc'];
                                    setSortConfig({ key, direction });
                                }}>
                                    <DropdownMenuRadioItem value="createdAt-desc">{t('sales.newestFirst')}</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="createdAt-asc">{t('sales.oldestFirst')}</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="revenueMinor-desc">{t('sales.amountDesc')}</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="revenueMinor-asc">{t('sales.amountAsc')}</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="clientName-asc">{t('sales.clientAZ')}</DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="clientName-desc">{t('sales.clientZA')}</DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </CardHeader>
        </Card>

        <FancyCard>
          <CardHeader><CardTitle>{t('sales.salesHistory')}</CardTitle></CardHeader>
          <CardContent>
            {salesLoading ? <p>{t('sales.loadingSales')}...</p> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('sales.date')}</TableHead>
                    <TableHead>{t('sales.productName')}</TableHead>
                    <TableHead>{t('sales.clientName')}</TableHead>
                    <TableHead className="text-center">{t('sales.quantity')}</TableHead>
                    <TableHead className="text-right">{t('sales.total')}</TableHead>
                    <TableHead>{t('sales.paymentType')}</TableHead>
                    <TableHead>{t('sales.seller')}</TableHead>
                    <TableHead className="text-center">{t('sales.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{(() => {
                          const d = safeGetDate(sale.createdAt);
                          return d ? format(d, 'yyyy-MM-dd HH:mm') : '';
                      })()}</TableCell>
                      <TableCell className="font-medium">{sale.productName}</TableCell>
                      <TableCell>{sale.clientName}</TableCell>
                      <TableCell className="text-center">{sale.quantity}</TableCell>
                      <TableCell className="text-right">{formatMoneyMinor(sale.revenueMinor!, sale.salePriceCurrency as Currency)}</TableCell>
                      <TableCell>{t(`sales.${sale.paymentType.toLowerCase()}`)}</TableCell>
                      <TableCell>{sale.sellerName}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(sale)}>
                                <Edit className="mr-2 h-4 w-4" />
                                <span>{t('sales.edit')}</span>
                            </DropdownMenuItem>
                            {canDelete && (
                                <DropdownMenuItem onClick={() => openDeleteDialog(sale)} className="text-destructive">
                                    {t('sales.delete')}
                                </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </FancyCard>
      </div>
      <AddSaleDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onAddSale={handleAddSale} />
      {selectedSale && (
        <EditSaleDialog 
          open={isEditDialogOpen} 
          onOpenChange={setIsEditDialogOpen}
          sale={selectedSale}
          onUpdateSale={handleUpdateSale}
          products={products || []}
          clients={clients || []}
          sellers={sellers || []}
        />
      )}
      {selectedSale && canDelete && (
        <DeleteSaleDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} onConfirm={() => handleAdminHardDelete(selectedSale)} />
      )}
    </>
  );
}

