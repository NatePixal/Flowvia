
'use client';
import { useState, useMemo } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { PlusCircle, MoreHorizontal, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AddProductDialog from '@/components/inventory/add-product-dialog';
import EditProductDialog from '@/components/inventory/edit-product-dialog';
import DeleteProductDialog from '@/components/inventory/delete-product-dialog';
import type { Product, Company } from '@/lib/types';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { collection, setDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useCurrency } from '@/lib/currency-provider';
import { exchangeRates, BASE_CURRENCY } from '@/lib/currency-provider';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Skeleton } from '@/components/ui/skeleton';
import { hasPermission } from '@/lib/permissions';

export default function InventoryPage() {
  const { t } = useTranslation();
  const { firestore, userProfile, user } = useFirebase();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  
  const { data: products, isLoading: productsLoading } = useCompanyCollection<Product>('products');
  
  const companyDocRef = useMemoFirebase(() => {
    if (userProfile && userProfile.companyId) {
      return doc(firestore, 'companies', userProfile.companyId);
    }
    return null;
  }, [userProfile, firestore]);

  const { data: company, isLoading: companyLoading } = useDoc<Company>(companyDocRef);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const loading = productsLoading || companyLoading;

  const handleAddProduct = async (newProduct: Omit<Product, 'id' | 'companyId'>) => {
    if (!firestore || !userProfile || !userProfile.companyId) {
       toast({
            variant: "destructive",
            title: t('error'),
            description: t('couldNotAddProductNoCompany'),
        });
        return;
    }

    const productCode = newProduct.productCode.toUpperCase().trim();
    if (!productCode) {
        toast({
            variant: "destructive",
            title: t('error'),
            description: t('productCodeIsRequired'),
        });
        return;
    }

    const productRef = doc(firestore, 'products', productCode);

    const purchasePriceInBase = newProduct.purchasePrice / exchangeRates[newProduct.purchasePriceCurrency];
    const sellingPriceInBase = newProduct.sellingPrice / exchangeRates[newProduct.sellingPriceCurrency];

    try {
        await setDoc(productRef, {
            ...newProduct,
            companyId: userProfile.companyId, // Ensure companyId is set
            productCode: productCode,
            purchasePriceBase: purchasePriceInBase,
            sellingPriceBase: sellingPriceInBase,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isDeleted: false, // For soft delete
            lowStock: (newProduct.quantity || 0) <= (newProduct.minStock || 0),
        });
        toast({
            title: t('productCreated'),
            description: `${newProduct.name} ${t('hasBeenAddedToInventory')}.`
        });
        setIsAddDialogOpen(false);
    } catch (e: any) {
        console.error("Failed to add product:", e);
        toast({
            variant: "destructive",
            title: t('error'),
            description: e.message || t('couldNotAddProduct'),
        });
    }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
    if (!firestore || !updatedProduct.id || !userProfile?.companyId) return;
    const productRef = doc(firestore, 'products', updatedProduct.id);
    
    const { id, ...productData } = updatedProduct;

    const purchasePriceInBase = productData.purchasePrice / exchangeRates[productData.purchasePriceCurrency];
    const sellingPriceInBase = productData.sellingPrice / exchangeRates[productData.sellingPriceCurrency];

    try {
        await updateDoc(productRef, {
          ...productData,
          companyId: userProfile.companyId, // Ensure companyId is always present
          purchasePriceBase: purchasePriceInBase,
          sellingPriceBase: sellingPriceInBase,
          updatedAt: serverTimestamp(),
          lowStock: (productData.quantity || 0) <= (productData.minStock || 0),
        });
        toast({
            title: t('productUpdated'),
            description: `${productData.name} ${t('hasBeenUpdated')}.`
        });
        setIsEditDialogOpen(false);
    } catch (e: any) {
        console.error("Failed to update product:", e);
        toast({
            variant: "destructive",
            title: t('error'),
            description: e.message || t('couldNotUpdateProduct'),
        });
    }
  };

  const handleDeleteProduct = async () => {
    if (!firestore || !selectedProduct?.id || !user?.uid) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: t('productOrDbIsUnavailable'),
      });
      return;
    }
  
    try {
      // Soft delete: update the product document
      const productRef = doc(firestore, 'products', selectedProduct.id);
      await updateDoc(productRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user.uid,
      });
      
      toast({
        title: t('productDeleted'),
        description: `${selectedProduct.name} ${t('hasBeenRemovedFromInventory')}.`,
      });

    } catch (e: any) {
      console.error("Delete failed:", e);
      toast({
        variant: 'destructive',
        title: t('error'),
        description: e.message || t('couldNotDeleteProduct'),
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setSelectedProduct(null);
    }
  };


  const openEditDialog = (product: Product) => {
    setSelectedProduct(product);
    setIsEditDialogOpen(true);
  };
  
  const openDeleteDialog = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const formatWithCurrency = (price: number, priceCurrency: string) => {
    const currencyCode = priceCurrency && exchangeRates[priceCurrency as keyof typeof exchangeRates] ? priceCurrency : BASE_CURRENCY;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  }

  const toBaseCurrency = (value: number, currency: string) => {
    const rate = exchangeRates[currency as keyof typeof exchangeRates] ?? 1;
    return value / rate;
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            {t('inventory')}
          </h1>
          {hasPermission(userProfile, 'products', 'create') && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('addProduct')}
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('productList')}</CardTitle>
          </CardHeader>
          <CardContent>
             {loading && <p>{t('loading')}...</p>}
             {!loading && (!products || products.length === 0) && (
                 <div className="text-center text-muted-foreground py-8">
                     <Package className="mx-auto h-12 w-12" />
                     <p className="mt-4">{t('noProductsFound')}</p>
                     <p className="text-sm">{t('startByAddingANewProduct')}</p>
                 </div>
             )}
             {!loading && products && products.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {products.map((product) => (
                    <Card key={product.id}>
                      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
                          <CardTitle className="text-lg">{product.name}</CardTitle>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="-mt-2 -mr-2 h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {hasPermission(userProfile, 'products', 'edit') && (
                                <DropdownMenuItem onClick={() => openEditDialog(product)}>
                                  {t('edit')}
                                </DropdownMenuItem>
                              )}
                              {hasPermission(userProfile, 'products', 'delete') && (
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => openDeleteDialog(product)}
                                >
                                  {t('delete')}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </CardHeader>

                      <CardContent className="space-y-2 text-sm">
                        {product.imageUrl && (
                          <div className="relative h-40 w-full mb-4">
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              className="rounded-md object-cover"
                            />
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('stock')}:</span>
                          <span className="font-bold">{product.quantity}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('purchase')}:</span>
                          <span>{formatWithCurrency(product.purchasePrice, product.purchasePriceCurrency)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('selling')}:</span>
                          <span>{formatWithCurrency(product.sellingPrice, product.sellingPriceCurrency)}</span>
                        </div>
                         <div className="flex justify-between text-green-600">
                            <span className="text-muted-foreground">{t('profit')}:</span>
                            <span className="font-medium">
                                {formatCurrency(
                                    toBaseCurrency(product.sellingPrice, product.sellingPriceCurrency) -
                                    toBaseCurrency(product.purchasePrice, product.purchasePriceCurrency)
                                )}
                            </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
             )}
          </CardContent>
        </Card>
      </div>
      <AddProductDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddProduct={handleAddProduct}
      />
      {selectedProduct && (
        <EditProductDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          product={selectedProduct}
          onUpdateProduct={handleUpdateProduct}
        />
      )}
       {selectedProduct && (
        <DeleteProductDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteProduct}
        />
      )}
    </>
  );
}
