
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Product, Supplier } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { debounce } from 'lodash';

interface AddIncomingProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddIncomingProduct: (product: any) => void;
  products: Product[];
  suppliers: Supplier[];
}

export default function AddIncomingProductDialog({
  open,
  onOpenChange,
  onAddIncomingProduct,
  products,
  suppliers,
}: AddIncomingProductDialogProps) {
  const { t } = useTranslation();
  const [productName, setProductName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [location, setLocation] = useState('');
  const [minStock, setMinStock] = useState('');
  
  const [isExistingProduct, setIsExistingProduct] = useState(false);

  const resetForm = useCallback(() => {
    setProductName('');
    setProductCode('');
    setCategory('');
    setSupplier('');
    setQuantity('');
    setCost('');
    setLocation('');
    setMinStock('0');
    setIsExistingProduct(false);
  }, []);
  
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleProductCodeChange = (code: string) => {
    const uppercaseCode = code.toUpperCase();
    setProductCode(uppercaseCode);
    debouncedLookup(uppercaseCode);
  };
  
  const debouncedLookup = useCallback(
    debounce((code: string) => {
      if (!code) {
        setIsExistingProduct(false);
        setProductName('');
        setCategory('');
        return;
      }
      const existingProduct = products.find(p => p.productCode?.toUpperCase() === code);
      if (existingProduct) {
        setIsExistingProduct(true);
        setProductName(existingProduct.name);
        setCategory(existingProduct.category);
        setCost(String(existingProduct.cost));
        setSupplier(existingProduct.supplier || '');
        setLocation(existingProduct.location || '');
        setMinStock(String(existingProduct.minStock || 0));
      } else {
        setIsExistingProduct(false);
        setProductName('');
        setCategory('');
      }
    }, 300),
    [products]
  );


  const handleSubmit = () => {
    const newProductData = {
      name: productName,
      productCode: productCode.toUpperCase(),
      category,
      quantity: parseInt(quantity, 10) || 0,
      cost: parseFloat(cost) || 0,
      supplier,
      location,
      minStock: parseInt(minStock, 10) || 0,
    };
    onAddIncomingProduct(newProductData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addIncomingProduct')}</DialogTitle>
          <DialogDescription>
            {t('startByEnteringTheProductCode')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="productCode">{t('productCode')} <span className="text-destructive">*</span></Label>
            <Input id="productCode" value={productCode} onChange={(e) => handleProductCodeChange(e.target.value)} placeholder={t('enterProductCodeFirst')} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="name">{t('productName')}</Label>
            <Input id="name" value={productName} onChange={(e) => setProductName(e.target.value)} disabled={isExistingProduct} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="category">{t('category')}</Label>
            <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} disabled={isExistingProduct}/>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">{t('quantityReceived')} <span className="text-destructive">*</span></Label>
            <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost">{t('unitCost')}</Label>
            <Input id="cost" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
           <div className="col-span-2 space-y-2">
            <Label htmlFor="supplier">{t('supplier')}</Label>
            <Select onValueChange={setSupplier} value={supplier}>
                <SelectTrigger>
                    <SelectValue placeholder={t('selectSupplier')} />
                </SelectTrigger>
                <SelectContent>
                    {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">{t('location')}</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minStock">{t('minStockLevel')}</Label>
            <Input id="minStock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>
            {isExistingProduct ? t('updateStock') : t('createAndAddStock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
