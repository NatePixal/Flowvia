
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import type { Product, Supplier, Currency, FxSnapshot, Location } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { debounce } from 'lodash';
import { normalizeRateToBase } from '@/lib/money';
import { serverTimestamp } from 'firebase/firestore';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Calendar } from '../ui/calendar';
import { normalizeProductCode } from '@/lib/normalize';

interface AddIncomingProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddIncomingProduct: (payload: any) => void;
  products: Product[];
  suppliers: Supplier[];
  baseCurrency: Currency;
}

export default function AddIncomingProductDialog({
  open,
  onOpenChange,
  onAddIncomingProduct,
  products,
  suppliers,
  baseCurrency,
}: AddIncomingProductDialogProps) {
  const { t, ready } = useTranslation();
  const { locationsEnabled } = useFirebase();
  const { data: locations } = useCompanyCollection<Location>('locations');

  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');

  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');

  const [currency, setCurrency] = useState<Currency>('USD');
  const [locationId, setLocationId] = useState('');
  const [minStock, setMinStock] = useState('');
  const [incomeDate, setIncomeDate] = useState<Date | undefined>(new Date());

  const [isExistingProduct, setIsExistingProduct] = useState(false);

  // Manual FX
  const needsFx = useMemo(() => currency !== baseCurrency, [currency, baseCurrency]);
  const [fxRate, setFxRate] = useState('');

  const resetForm = useCallback(() => {
    setProductCode('');
    setProductName('');
    setCategory('');
    setSupplier('');
    setQuantity('');
    setUnitCost('');
    setCurrency('USD');
    setLocationId('');
    setMinStock('');
    setIsExistingProduct(false);
    setFxRate('');
    setIncomeDate(new Date());
  }, []);

  useEffect(() => {
    if (open) resetForm();
  }, [open, resetForm]);

  const debouncedLookup = useCallback(
    debounce((code: string) => {
      if (!code) {
        setIsExistingProduct(false);
        setProductName('');
        setCategory('');
        return;
      }

      const existing = products.find((p) => p.productCode?.toUpperCase() === code);
      if (existing) {
        setIsExistingProduct(true);
        setProductName(existing.name);
        setCategory(existing.category);

        // For correct model: receipt currency should match product purchase currency
        setCurrency(existing.purchasePriceCurrency || 'USD');

        // Prefill with last known legacy cost (still useful as a hint)
        setUnitCost(String(existing.cost ?? existing.purchasePrice ?? ''));

        setSupplier(existing.supplier || '');
        setLocationId('');
        setMinStock(String(existing.minStock || 0));
      } else {
        setIsExistingProduct(false);
        setProductName('');
        setCategory('');
      }
    }, 250),
    [products]
  );

  const handleProductCodeChange = (code: string) => {
    const normalizedCode = normalizeProductCode(code);
    setProductCode(normalizedCode);
    debouncedLookup(normalizedCode);
  };

  const handleSubmit = () => {
    if (!productCode || !incomeDate) return;

    // Option 1 flow: product must exist in Inventory first
    if (!isExistingProduct) {
      alert('Create the product in Inventory first, then top up stock here.');
      return;
    }

    const qty = parseInt(quantity, 10) || 0;
    const cost = parseFloat(unitCost) || 0;

    if (locationsEnabled && !locationId) {
      alert('Select a shop/location first.');
      return;
    }

    if (qty <= 0) {
      alert('Quantity must be greater than 0.');
      return;
    }
    if (cost < 0) {
      alert('Unit cost must be >= 0.');
      return;
    }

    let fx: FxSnapshot | undefined;

    if (needsFx) {
      const enteredRate = parseFloat(fxRate);
      if (!Number.isFinite(enteredRate) || enteredRate <= 0) {
        alert('FX rate is required and must be > 0.');
        return;
      }
      
      const enteredPair = `${baseCurrency}->${currency}`;
      const rateToBase = normalizeRateToBase(enteredRate, enteredPair, currency, baseCurrency);
      
      fx = {
        rateToBase,
        enteredRate,
        enteredPair,
        capturedAt: serverTimestamp(),
      };
    }

    onAddIncomingProduct({
      productCode: productCode,
      quantity: qty,
      supplier,
      unitCost: cost,
      currency,
      locationId: locationsEnabled ? locationId : '',
      minStock: parseInt(minStock, 10) || 0,
      fx,
      incomeDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('incoming.addIncomingProduct')}</DialogTitle>
            <DialogDescription>{t('incoming.startByEnteringTheProductCode')}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="productCode">
                {t('incoming.productCode')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="productCode"
                value={productCode}
                onChange={(e) => handleProductCodeChange(e.target.value)}
                placeholder={t('incoming.enterProductCodeFirst')}
              />
              {!isExistingProduct && productCode && (
                <p className="text-xs text-destructive">
                  Create this product in Inventory first, then add incoming stock here.
                </p>
              )}
            </div>
            
            <div className="col-span-2 space-y-2">
              <Label htmlFor="incomeDate">{t('incoming.incomeDate')} <span className="text-destructive">*</span></Label>
               <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !incomeDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {incomeDate ? format(incomeDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={incomeDate}
                    onSelect={setIncomeDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">{t('incoming.productName')}</Label>
              <Input id="name" value={productName} disabled />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="category">{t('incoming.category')}</Label>
              <Input id="category" value={category} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                {t('incoming.quantityReceived')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unitCost">{t('incoming.unitCost')}</Label>
              <div className="flex gap-2">
                <Input
                  id="unitCost"
                  type="number"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  className="flex-1"
                />
                <Select onValueChange={(v) => setCurrency(v as Currency)} value={currency}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="UZS">UZS</SelectItem>
                    <SelectItem value="CNY">CNY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {needsFx && baseCurrency && (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="fxRate">{t('incoming.currentRate')}</Label>
                <Input
                  id="fxRate"
                  type="number"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  placeholder="12200"
                />
                <p className="text-xs text-muted-foreground">
                  {`1 ${baseCurrency} = X ${currency}`}
                </p>
              </div>
            )}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="supplier">{t('incoming.supplier')}</Label>
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

            <div className="space-y-2">
              <Label htmlFor="location">{t('incoming.location')}</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minStock">{t('incoming.minStockLevel')}</Label>
              <Input
                id="minStock"
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {t('incoming.cancel')}
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={!isExistingProduct}>
              {t('incoming.updateStock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
