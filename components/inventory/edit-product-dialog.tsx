'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Product } from '@/lib/types';

interface EditProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  onUpdateProduct: (product: Product) => void;
}

export default function EditProductDialog({ open, onOpenChange, product, onUpdateProduct }: EditProductDialogProps) {
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');

  useEffect(() => {
    if (product) {
      setName(product.name);
      setProductCode(product.productCode);
      setCategory(product.category);
      setQuantity(String(product.quantity));
      setPurchasePrice(String(product.purchasePrice));
      setSellingPrice(String(product.sellingPrice));
    }
  }, [product]);

  const handleSubmit = () => {
    if (!name || !productCode || !quantity || !purchasePrice || !sellingPrice) {
        toast({ variant: "destructive", title: "Missing Fields", description: "Please fill all required fields." });
        return;
    }
    
    onUpdateProduct({
      ...product,
      name,
      productCode,
      category,
      quantity: parseInt(quantity, 10),
      purchasePrice: parseFloat(purchasePrice),
      sellingPrice: parseFloat(sellingPrice),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
          <DialogDescription>Update the details for this product.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="productCode">Product Code</Label>
            <Input id="productCode" value={productCode} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Product Name <span className="text-destructive">*</span></Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity <span className="text-destructive">*</span></Label>
              <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purchasePrice">Purchase Price <span className="text-destructive">*</span></Label>
              <Input id="purchasePrice" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sellingPrice">Selling Price <span className="text-destructive">*</span></Label>
            <Input id="sellingPrice" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSubmit}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
