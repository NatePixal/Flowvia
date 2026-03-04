'use client';

import { useState, useEffect } from 'react';
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
import { useFirebase } from '@/firebase';


const convertLegacyAmount = (amount: number, from: Currency, to: Currency) => {
  const fromPerUsd = exchangeRates[from] || 1;
  const toPerUsd = exchangeRates[to] || 1;
  if (from === to) return amount;
  return (amount / fromPerUsd) * toPerUsd;
};

interface EditProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  onUpdateProduct: (id: string, data: Partial<Omit<Product, 'id' | 'companyId'>>) => void;
  suppliers: Supplier[];
}

export default function EditProductDialog({ open, onOpenChange, product, onUpdateProduct, suppliers }: EditProductDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();
  const { companyBaseCurrency } = useFirebase();
  const [name, setName] = useState('');
  const [productCode,
      barcode: (barcode || productCode).toUpperCase(), setProductCode] = useState('');
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


  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setProductCode(product.productCode || '');
      setCategory(product.category || '');
      setSupplier(product.supplier || '');
      setQuantity((product.quantity || 0).toString());
      
      setPurchasePrice((product.purchasePrice || 0).toString());
      setPurchasePriceCurrency(product.purchasePriceCurrency || '');

      setSellingPrice((product.sellingPrice || 0).toString());
      setSellingPriceCurrency(product.sellingPriceCurrency || '');

      setLocation(product.warehouseLocation || '');
      setSize(product.size || '');
      setWeight((product.weight || 0).toString());
      setColor(product.color || '');
      setImageUrl(product.imageUrl || '');
      setMinStock((product.minStock || 0).toString());
      setUnitVolume((product.unitVolume || 0).toString());
    }
  }, [product]);

  const handleSubmit = () => {
    if (!product) return;
    if (!purchasePriceCurrency || !sellingPriceCurrency) {
         toast({
            variant: "destructive",
            title: t('missingFields'),
            description: t('pleaseSelectACurrency'),
        });
        return;
    }
    
    const purchaseP = parseFloat(purchasePrice) || 0;
    const sellingP = parseFloat(sellingPrice) || 0;

    const baseCcy = companyBaseCurrency || 'USD';
    const purchasePriceInBase = convertLegacyAmount(purchaseP, purchasePriceCurrency, baseCcy);
    const sellingPriceInBase = convertLegacyAmount(sellingP, sellingPriceCurrency, baseCcy);

    const values = { 
      ...product,
      name, 
      productCode,
      barcode: (barcode || productCode).toUpperCase(),
      category,
      supplier,
      quantity: parseInt(quantity, 10) || 0,
      
      purchasePrice: purchaseP,
      purchasePriceCurrency,
      purchasePriceBase: purchasePriceInBase,
      
      sellingPrice: sellingP,
      sellingPriceCurrency,
      sellingPriceBase: sellingPriceInBase,

      location,
      size,
      weight: parseFloat(weight) || 0,
      color,
      imageUrl,
      minStock: parseInt(minStock, 10) || 0,
      unitVolume: parseFloat(unitVolume) || 0,
    };
    
    const { id, companyId, ...clean } = values as any;

    onUpdateProduct(product.id, clean);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('editProduct')}</DialogTitle>
            <DialogDescription>{t('updateTheDetailsOfThisProduct')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="productCode">{t('productCode')}</Label>
              <Input id="productCode" value={productCode} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t('productName')}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">{t('category')}</Label>
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
             <div className="space-y-2">
              <Label htmlFor="supplier">{t('supplier')}</Label>
                <Select onValueChange={setSupplier} value={supplier}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('selectSupplier')} />
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
                  <Label htmlFor="purchasePrice">{t('purchasePrice')}</Label>
                  <Input id="purchasePrice" type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="purchasePriceCurrency">{t('currency')}</Label>
                  <Select onValueChange={(v) => setPurchasePriceCurrency(v as Currency)} value={purchasePriceCurrency}>
                      <SelectTrigger><SelectValue placeholder={t('selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="SAR">SAR</SelectItem>
                          <SelectItem value="JOD">JOD</SelectItem>
                          <SelectItem value="EGP">EGP</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
            </div>
             <div className="space-y-2 col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                  <Label htmlFor="sellingPrice">{t('sellingPrice')}</Label>
                  <Input id="sellingPrice" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="sellingPriceCurrency">{t('currency')}</Label>
                  <Select onValueChange={(v) => setSellingPriceCurrency(v as Currency)} value={sellingPriceCurrency}>
                      <SelectTrigger><SelectValue placeholder={t('selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="SAR">SAR</SelectItem>
                          <SelectItem value="JOD">JOD</SelectItem>
                          <SelectItem value="EGP">EGP</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                  </Select>
               </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">{t('quantity')}</Label>
              <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minStock">{t('minStockLevel')}</Label>
              <Input id="minStock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">{t('size')}</Label>
              <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">{t('weightKg')}</Label>
              <Input id="weight" type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">{t('color')}</Label>
              <Input id="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitVolume">{t('unitVolumeM3')}</Label>
              <Input id="unitVolume" type="number" value={unitVolume} onChange={(e) => setUnitVolume(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label htmlFor="imageUrl">{t('imageUrl')}</Label>
              <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://example.com/image.png" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
