
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, FileDown, BadgeAlert, AlertCircle, Package, RefreshCw, SlidersHorizontal, ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { doc, setDoc, serverTimestamp, updateDoc, deleteDoc, orderBy, Timestamp } from 'firebase/firestore';
import type { Product, Company, Supplier, Currency } from '@/lib/types';
import AddProductDialog from '@/components/inventory/add-product-dialog';
import EditProductDialog from '@/components/inventory/edit-product-dialog';
import DeleteProductDialog from '@/components/inventory/delete-product-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { useCurrency } from '@/lib/currency-provider';
import { Badge } from '@/components/ui/badge';
import InventoryStockChart from '@/components/inventory/inventory-stock-chart';
import WarehouseUsage from '@/components/inventory/warehouse-usage';
import { useDoc } from '@/firebase/firestore/use-doc';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { toMinor, formatMoneyMinor } from '@/lib/money';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { format } from 'date-fns';
import { hasPermission } from '@/lib/permissions';
import { FancyCard } from '@/components/ui/fancy-card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SortKey = 'createdAt' | 'name' | 'quantity' | 'category';

export default function InventoryPage() {
  const { t } = useTranslation();
  const { firestore, userProfile, refreshUserProfile, user } = useFirebase();
  const { toast } = useToast();
  const { currency: displayCurrency } = useCurrency();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtering and Sorting State
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState('all'); // all, in_stock, low_stock, out_of_stock
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  const companyId = userProfile?.companyId;
  const canExport = hasPermission(userProfile, 'products', 'export');

  const productsOrder = useMemo(() => orderBy('createdAt', 'desc'), []);
  const { data: products, loading: productsLoading, error: productsError } = useCompanyCollection<Product>('products', productsOrder);
  const { data: suppliers, loading: suppliersLoading } = useCompanyCollection<Supplier>('suppliers');

  const companyDocRef = useMemo(() =>
      (firestore && companyId)
          ? doc(firestore, 'companies', companyId)
          : null,
      [firestore, companyId]
  );
  const { data: company, isLoading: companyLoading } = useDoc<Company>(companyDocRef);

  const uniqueCategories = useMemo(() => {
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    return ['all', ...Array.from(categories)];
  }, [products]);

  const filteredAndSortedProducts = useMemo(() => {
    let filtered = [...products];

    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(lowercasedFilter) ||
        p.productCode.toLowerCase().includes(lowercasedFilter)
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === categoryFilter);
    }

    if (stockFilter !== 'all') {
      filtered = filtered.filter(p => {
        const minStock = p.minStock || 0;
        if (stockFilter === 'in_stock') return p.quantity > minStock;
        if (stockFilter === 'low_stock') return p.quantity > 0 && p.quantity <= minStock;
        if (stockFilter === 'out_of_stock') return p.quantity === 0;
        return true;
      });
    }

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
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [products, searchTerm, categoryFilter, stockFilter, sortConfig]);


  const handleAddProduct = async (
    productData: Omit<Product, 'id' | 'companyId'>
  ) => {
    if (!firestore || !companyId) {
      toast({
        variant: 'destructive',
        title: t('toast.error.title'),
        description: t('toast.error.companyIdMissingError'),
      });
      return;
    }
    if (!productData.productCode) {
      toast({
        variant: 'destructive',
        title: t('toast.error.title'),
        description: 'Product code is required to create a product.',
      });
      return;
    }

    try {
      const productsCol = companyCollection(firestore, companyId, 'products');
      const productRef = doc(productsCol, productData.productCode);

      const payload = {
        ...withCompanyId(companyId, productData),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(productRef, payload);
      toast({
        title: t('toast.success.productAdded'),
        description: t('toast.success.productAddedSuccessMessage'),
      });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      console.error('[handleAddProduct] Failed to create product', e);
      toast({
        variant: 'destructive',
        title: t('toast.error.title'),
        description: e?.message || 'Failed to create product.',
      });
    }
  };

  const handleUpdateProduct = async (id: string, data: Partial<Omit<Product, 'id' | 'companyId'>>) => {
    if (!firestore || !companyId) return;
    try {
      const productRef = companyDoc(firestore, companyId, `products/${id}`);
      await updateDoc(productRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
      toast({ title: t('toast.success.productUpdated'), description: t('toast.success.productUpdatedSuccessMessage') });
      setIsEditDialogOpen(false);
      setSelectedProduct(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleDeleteProduct = async () => {
    if (!firestore || !selectedProduct?.id || !companyId) return;
    try {
      await deleteDoc(companyDoc(firestore, companyId, `products/${selectedProduct.id}`));
      toast({ title: t('toast.success.productDeleted'), description: t('toast.success.productDeletedSuccessMessage') });
      setIsDeleteDialogOpen(false);
      setSelectedProduct(null);
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
    if (!filteredAndSortedProducts || filteredAndSortedProducts.length === 0) {
      toast({
        variant: 'destructive',
        title: t('toast.error.noDataToExport'),
        description: t('toast.error.thereAreNoProductsToExport')
      });
      return;
    }

    exportToXlsx(
      `inventory_${companyId}_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      "Inventory",
      filteredAndSortedProducts,
      [
        { header: "Product Code", value: r => r.productCode },
        { header: "Name", value: r => r.name },
        { header: "Category", value: r => r.category },
        { header: "Quantity", value: r => r.quantity },
        { header: "Purchase Price", value: r => r.purchasePrice },
        { header: "Purchase Currency", value: r => r.purchasePriceCurrency },
        { header: "Selling Price", value: r => r.sellingPrice },
        { header: "Selling Currency", value: r => r.sellingPriceCurrency },
        { header: "Supplier", value: r => r.supplier },
        { header: "Min Stock", value: r => r.minStock },
      ]
    );
  }

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshUserProfile();
    setTimeout(() => setIsRefreshing(false), 500);
  };


  const openEditDialog = (product: Product) => {
    setSelectedProduct(product);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const lowStockProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(p => p.quantity <= (p.minStock || 0));
  }, [products]);

  const isLoading = productsLoading || companyLoading || suppliersLoading;

  if (productsError) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
             <Alert variant="destructive" className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('toast.error.title')}: {productsError.message}</AlertTitle>
                <AlertDescription>
                    <p>{t('accountIsNotLinkedToACompany')}</p>
                    <div className="mt-4 text-xs bg-secondary p-2 rounded">
                        <p>UID: {user?.uid}</p>
                        <p>Role: {userProfile?.role || 'N/A'}</p>
                    </div>
                </AlertDescription>
            </Alert>
            <Button onClick={handleRefresh} disabled={isRefreshing} className="mt-6">
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? t('refreshing') : t('forceRefreshSession')}
            </Button>
        </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('inventory.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('inventory.pageDescription')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {canExport && <Button variant="outline" onClick={handleExport}><FileDown className="mr-2 h-4 w-4" />{t('inventory.export')}</Button>}
            <Button onClick={() => setIsAddDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />{t('inventory.addProduct')}</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <FancyCard>
                <InventoryStockChart products={products} loading={isLoading} />
              </FancyCard>
            </div>
            <div className="lg:col-span-2 flex flex-col gap-6">
              <FancyCard>
                <WarehouseUsage products={products || []} company={company ?? undefined} loading={isLoading} />
              </FancyCard>
              <FancyCard>
                 <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BadgeAlert className="text-destructive" /> {t('inventory.lowStockAlerts')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                       {isLoading ? <p>{t('misc.loading')}...</p> : (
                          lowStockProducts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('inventory.allProductsAreWellStocked')}</p>
                          ) : (
                            <ul className="space-y-2 text-sm">
                                {lowStockProducts.slice(0, 3).map(p => (
                                    <li key={p.id} className="flex justify-between items-center">
                                        <span>{p.name} ({p.productCode})</span>
                                        <Badge variant="destructive">{t('inventory.stock')}: {p.quantity}</Badge>
                                    </li>
                                ))}
                                {lowStockProducts.length > 3 && (
                                    <li className="text-center text-muted-foreground">... {t('misc.andXMore', {count: lowStockProducts.length - 3})}</li>
                                )}
                            </ul>
                          )
                       )}
                    </CardContent>
                </Card>
              </FancyCard>
            </div>
        </div>

        <FancyCard>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{t('inventory.productList')}</CardTitle>
                  <CardDescription>{t('inventory.totalProducts')}: {products?.length || 0}</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder={t('inventory.searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-xs"
                  />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder={t('inventory.categoryFilterPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat === 'all' ? t('inventory.allCategories') : cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline"><ListFilter className="mr-2 h-4 w-4" />{t('inventory.sortBy')}</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t('inventory.sortBy')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuRadioGroup value={`${sortConfig.key}-${sortConfig.direction}`} onValueChange={(v) => {
                        const [key, direction] = v.split('-') as [SortKey, 'asc' | 'desc'];
                        setSortConfig({ key, direction });
                      }}>
                        <DropdownMenuRadioItem value="createdAt-desc">{t('inventory.newestFirst')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="createdAt-asc">{t('inventory.oldestFirst')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="name-asc">{t('inventory.nameAZ')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="name-desc">{t('inventory.nameZA')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="quantity-desc">{t('inventory.quantityDesc')}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="quantity-asc">{t('inventory.quantityAsc')}</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? <p>{t('inventory.loadingProducts')}...</p> : (
                  filteredAndSortedProducts && filteredAndSortedProducts.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('inventory.productCode')}</TableHead>
                          <TableHead>{t('inventory.productName')}</TableHead>
                          <TableHead>{t('inventory.category')}</TableHead>
                          <TableHead className="text-center">{t('inventory.quantity')}</TableHead>
                          <TableHead className="text-right">{t('inventory.sellingPrice')}</TableHead>
                          <TableHead className="text-right">{t('inventory.purchasePrice')}</TableHead>
                          <TableHead className="text-center">{t('inventory.status')}</TableHead>
                          <TableHead className="text-center">{t('inventory.actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAndSortedProducts.map((product) => (
                          <TableRow key={product.id}>
                            <TableCell className="font-mono">{product.productCode}</TableCell>
                            <TableCell className="font-medium">{product.name}</TableCell>
                            <TableCell>{product.category}</TableCell>
                            <TableCell className="text-center">{product.quantity}</TableCell>
                            <TableCell className="text-right">{formatMoneyMinor(toMinor(product.sellingPrice, product.sellingPriceCurrency as Currency), product.sellingPriceCurrency as Currency)}</TableCell>
                            <TableCell className="text-right">{formatMoneyMinor(toMinor(product.purchasePrice, product.purchasePriceCurrency as Currency), product.purchasePriceCurrency as Currency)}</TableCell>
                            <TableCell className="text-center">
                                {product.quantity > (product.minStock || 0) ?
                                  <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">{t('status.inStock')}</Badge> :
                                  product.quantity > 0 ?
                                  <Badge variant="destructive">{t('status.lowStock')}</Badge> :
                                  <Badge variant="destructive">{t('status.outOfStock')}</Badge>
                                }
                            </TableCell>
                            <TableCell className="text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditDialog(product)}>{t('inventory.edit')}</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openDeleteDialog(product)} className="text-destructive">{t('inventory.delete')}</DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-8 border-2 border-dashed rounded-lg">
                          <Package className="h-12 w-12 mb-4" />
                          <p className="font-semibold">{t('inventory.noProductsFoundFiltered')}</p>
                          <p className="text-sm">{t('inventory.tryDifferentFilters')}</p>
                    </div>
                  )
              )}
            </CardContent>
          </Card>
        </FancyCard>
      </div>
      <AddProductDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onAddProduct={handleAddProduct} suppliers={suppliers || []} />
      {selectedProduct && <EditProductDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} product={selectedProduct} onUpdateProduct={handleUpdateProduct} suppliers={suppliers || []} />}
      {selectedProduct && <DeleteProductDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} onConfirm={handleDeleteProduct} />}
    </>
  );
}
