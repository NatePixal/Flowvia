'use client';

import { useState } from 'react';
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
import type { Product, Currency, Supplier } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { exchangeRates } from '@/lib/currency-provider';

interface AddProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProduct: (product: Omit<Product, 'id' | 'companyId'>) => void;
  suppliers: Supplier[];
}

export default function AddProductDialog({ open, onOpenChange, onAddProduct, suppliers }: AddProductDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('');

  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchasePriceCurrency, setPurchasePriceCurrency] = useState<Currency | ''>('');

  const [sellingPrice, setSellingPrice] = useState('');
  const [sellingPriceCurrency, setSellingPriceCurrency] = useState<Currency | ''>('');

  const [location, setLocation] = useState('');
  const [size, setSize] = useState('');
  const [weight, setWeight] = useState('');
  const [color, setColor] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [minStock, setMinStock] = useState('0');
  const [unitVolume, setUnitVolume] = useState('');


  const handleSubmit = () => {
    if (!productCode || !name || !purchasePriceCurrency || !sellingPriceCurrency) {
        toast({
            variant: "destructive",
            title: t('toast.error.missingFields'),
            description: t('toast.error.pleaseFillAllRequiredFields'),
        });
        return;
    }

    const purchaseP = parseFloat(purchasePrice) || 0;
    const sellingP = parseFloat(sellingPrice) || 0;

    const purchasePriceInBase = purchaseP / exchangeRates[purchasePriceCurrency];
    const sellingPriceInBase = sellingP / exchangeRates[sellingPriceCurrency];

    const productData = {
      name,
      productCode,
      category,
      supplier: supplier || '',
      quantity: parseInt(quantity, 10) || 0,

      purchasePrice: purchaseP,
      purchasePriceCurrency,
      purchasePriceBase: purchasePriceInBase,

      sellingPrice: sellingP,
      sellingPriceCurrency,
      sellingPriceBase: sellingPriceInBase,
      cost: purchaseP,

      location: location || '',
      size,
      weight: parseFloat(weight) || 0,
      color,
      imageUrl,
      minStock: parseInt(minStock, 10) || 0,
      unitVolume: parseFloat(unitVolume) || 0,
    };

    // The parent `handleAddProduct` in inventory/page.tsx handles adding companyId and timestamps.
    // We only send the clean product data from the form.
    onAddProduct(productData as any);

    // Reset form on successful submission (parent component will close the dialog)
    setName('');
    setProductCode('');
    setCategory('');
    setSupplier('');
    setQuantity('');
    setPurchasePrice('');
    setPurchasePriceCurrency('');
    setSellingPrice('');
    setSellingPriceCurrency('');
    setLocation('');
    setSize('');
    setWeight('');
    setColor('');
    setImageUrl('');
    setMinStock('0');
    setUnitVolume('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('inventory.addProduct')}</DialogTitle>
            <DialogDescription>{t('inventory.addANewProductToYourInventory')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="productCode">{t('inventory.productCode')} <span className="text-destructive">*</span></Label>
              <Input id="productCode" value={productCode} onChange={(e) => setProductCode(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2 sm:col-span-1">
              <Label htmlFor="name">{t('inventory.productName')} <span className="text-destructive">*</span></Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">{t('inventory.category')}</Label>
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="supplier">{t('inventory.supplier')}</Label>
              <Select onValueChange={setSupplier} value={supplier}>
                <SelectTrigger>
                  <SelectValue placeholder={t('incoming.selectSupplier')} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="purchasePrice">{t('inventory.purchasePrice')} <span className="text-destructive">*</span></Label>
                  <Input id="purchasePrice" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="purchasePriceCurrency">{t('label.currency')} <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => setPurchasePriceCurrency(v as Currency)} value={purchasePriceCurrency}>
                      <SelectTrigger><SelectValue placeholder={t('placeholder.selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
            </div>
             <div className="space-y-2 col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="sellingPrice">{t('inventory.sellingPrice')} <span className="text-destructive">*</span></Label>
                  <Input id="sellingPrice" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="sellingPriceCurrency">{t('label.currency')} <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => setSellingPriceCurrency(v as Currency)} value={sellingPriceCurrency}>
                      <SelectTrigger><SelectValue placeholder={t('placeholder.selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">{t('inventory.initialQuantity')}</Label>
              <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="minStock">{t('inventory.minStockLevel')}</Label>
              <Input id="minStock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">{t('inventory.size')}</Label>
              <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">{t('inventory.weightKg')}</Label>
              <Input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">{t('inventory.color')}</Label>
              <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="unitVolume">{t('inventory.unitVolumeM3')}</Label>
              <Input id="unitVolume" type="number" value={unitVolume} onChange={(e) => setUnitVolume(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="imageUrl">{t('inventory.imageUrl')}</Label>
              <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.png" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('clients.cancel')}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('inventory.addProduct')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
