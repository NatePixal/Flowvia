'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { PlusCircle, MoreHorizontal, Package } from 'lucide-react';
import { useFirebase } from '@/firebase/provider';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/types';
import { collection, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebase/client';
import AddProductDialog from '@/components/inventory/add-product-dialog';
import EditProductDialog from '@/components/inventory/edit-product-dialog';
import DeleteProductDialog from '@/components/inventory/delete-product-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

export default function InventoryPage() {
  const { userProfile } = useFirebase();
  const { toast } = useToast();
  
  const { data: products, isLoading } = useCompanyCollection<Product>('products');
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const handleAddProduct = async (productData: Omit<Product, 'id' | 'companyId' | 'createdAt'>) => {
    if (!userProfile?.companyId) {
      toast({ variant: "destructive", title: "Error", description: "Cannot add product: Company ID is missing." });
      return;
    }
    try {
      await addDoc(collection(db, 'products'), {
        ...productData,
        companyId: userProfile.companyId,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Product Added", description: `${productData.name} has been added to your inventory.` });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      console.error("Failed to add product:", e);
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleUpdateProduct = async (updatedData: Product) => {
    if (!selectedProduct) return;
    try {
      const productRef = doc(db, 'products', selectedProduct.id);
      await updateDoc(productRef, updatedData as any);
      toast({ title: "Product Updated", description: `${updatedData.name} has been updated.` });
      setIsEditDialogOpen(false);
    } catch (e: any) {
      console.error("Failed to update product:", e);
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    try {
      await deleteDoc(doc(db, 'products', selectedProduct.id));
      toast({ title: "Product Deleted", description: "The product has been removed from your inventory." });
      setIsDeleteDialogOpen(false);
    } catch (e: any) {
      console.error("Failed to delete product:", e);
      toast({ variant: "destructive", title: "Error", description: e.message });
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

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" /> Inventory</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        </div>
        
        <Card>
          <CardHeader><CardTitle>Product List</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full" />)}
              </div>
            ) : !products || products.length === 0 ? (
              <div className="text-center py-12">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No products found</h3>
                <p className="mt-1 text-sm text-muted-foreground">Start by adding a new product to your inventory.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map((product) => (
                  <Card key={product.id} className="flex flex-col">
                    <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                      <CardTitle className="text-lg font-medium">{product.name}</CardTitle>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="-mt-2 -mr-2 h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(product)}>Edit</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDeleteDialog(product)} className="text-destructive">Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2 text-sm">
                      <p className="text-muted-foreground">{product.productCode}</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">Category:</span><span>{product.category}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Stock:</span><span className="font-bold">{product.quantity}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Purchase Price:</span><span>${product.purchasePrice.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Selling Price:</span><span>${product.sellingPrice.toFixed(2)}</span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <AddProductDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onAddProduct={handleAddProduct} />
      {selectedProduct && <EditProductDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen} product={selectedProduct} onUpdateProduct={handleUpdateProduct} />}
      {selectedProduct && <DeleteProductDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen} onConfirm={handleDeleteProduct} />}
    </>
  );
}
