
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sale, Product, Client, Seller, Currency, FxSnapshot } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { normalizeRateToBase } from '@/lib/money';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdateSale: (saleId: string, updatedData: any) => Promise<void>;
  products: Product[];
  clients: Client[];
  sellers: Seller[];
}

export default function EditSaleDialog({ open, onOpenChange, sale, onUpdateSale, products, clients, sellers }: EditSaleDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { companyBaseCurrency } = useFirebase();

  const [clientId, setClientId] = useState('');
  const [productCode, setProductCode] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [salePriceCurrency, setSalePriceCurrency] = useState<Currency>('USD');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Partial' | 'Loan'>('Cash');
  const [date, setDate] = useState<Date | undefined>();
  const [exchangeRate, setExchangeRate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);

  const selectedProduct = useMemo(() => {
    return (products || []).find(p => p.productCode === productCode);
  }, [products, productCode]);

  const selectedClient = useMemo(() => {
    return (clients || []).find(c => c.id === clientId);
  }, [clients, clientId]);

  useEffect(() => {
    if (sale) {
      setClientId(sale.clientId);
      setProductCode(sale.productCode);
      setSellerId(sale.sellerId);
      setQuantity(String(sale.quantity));
      setSalePrice(String(sale.salePrice));
      setSalePriceCurrency(sale.salePriceCurrency);
      setPaymentType(sale.paymentType as 'Cash' | 'Partial' | 'Loan');
      setExchangeRate(String(sale.fx?.enteredRate || ''));
      const d = sale.date instanceof Timestamp ? sale.date.toDate() : new Date(sale.date as string);
      setDate(d);
    }
  }, [sale]);

  const showFxInput = useMemo(() => salePriceCurrency && companyBaseCurrency && salePriceCurrency !== companyBaseCurrency, [salePriceCurrency, companyBaseCurrency]);
  const fxPair = useMemo(() => `${companyBaseCurrency}->${salePriceCurrency}`, [companyBaseCurrency, salePriceCurrency]);

  const isSaleDisabled = useMemo(() => {
    if (isSubmitting || !selectedProduct) return true;
    const saleQuantity = parseInt(quantity, 10);
    const oldQuantity = sale.quantity;
    if (isNaN(saleQuantity) || saleQuantity <= 0) return true;
    if (showFxInput && (!exchangeRate || parseFloat(exchangeRate) <= 0)) return true;
    // Check available stock considering the quantity that will be returned from the old sale
    return selectedProduct.quantity + oldQuantity < saleQuantity;
  }, [selectedProduct, quantity, isSubmitting, showFxInput, exchangeRate, sale.quantity]);


  const handleSubmit = async () => {
    if (!sale?.id) return;

    if (!clientId || !productCode || !sellerId || !quantity || !salePrice || !salePriceCurrency || !date) {
        toast({ variant: "destructive", title: t('toast.error.missingFields') });
        return;
    }

    setIsSubmitting(true);
    try {
        const updatedData: any = {
            clientId,
            productId: selectedProduct!.id,
            quantity: parseInt(quantity, 10),
            salePrice: parseFloat(salePrice),
            salePriceCurrency,
            paymentType,
            date,
            sellerId,
        };

        if (showFxInput && companyBaseCurrency) {
            const enteredRate = parseFloat(exchangeRate);
            if (!enteredRate || enteredRate <= 0) throw new Error(t('toast.error.exchangeRateRequired'));

            updatedData.fx = {
                rateToBase: normalizeRateToBase(enteredRate, fxPair, salePriceCurrency, companyBaseCurrency),
                enteredRate,
                enteredPair: fxPair,
                capturedAt: serverTimestamp(),
            } as FxSnapshot;
        }

        await onUpdateSale(sale.id, updatedData);
        onOpenChange(false);

    } catch (e: any) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };


  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sales.editSale')}</DialogTitle>
          <DialogDescription>{t('sales.updateSaleDetails')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            {/* Fields for editing a sale */}
            <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="client" className="text-right">{t('sales.clientName')}</Label>
               <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="col-span-3 justify-between font-normal">
                          <span className="truncate">{selectedClient?.name || t('sales.selectClient')}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[375px] p-0">
                      <Command>
                          <CommandInput placeholder={t('sales.searchClient')} />
                          <CommandList>
                              <CommandEmpty>{t('sales.noClientFound')}</CommandEmpty>
                              <CommandGroup>
                                  {(clients || []).map((client) => (
                                  <CommandItem key={client.id} value={client.name} onSelect={() => { setClientId(client.id); setClientComboboxOpen(false); }}>
                                      <Check className={cn("mr-2 h-4 w-4", clientId === client.id ? "opacity-100" : "opacity-0")}/>
                                      {client.name}
                                  </CommandItem>
                                  ))}
                              </CommandGroup>
                          </CommandList>
                      </Command>
                  </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="product" className="text-right">{t('sales.product')}</Label>
              <Input value={selectedProduct?.name || ''} className="col-span-3" disabled />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">{t('sales.quantity')}</Label>
              <Input id="quantity" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="col-span-3" />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="salePrice" className="text-right">{t('sales.sellingPrice')}</Label>
                <Input id="salePrice" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="col-span-2" />
                 <Select onValueChange={(v) => setSalePriceCurrency(v as Currency)} value={salePriceCurrency}>
                    <SelectTrigger className="col-span-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="AED">AED</SelectItem>
                        <SelectItem value="UZS">UZS</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {showFxInput && (
              <div className="grid grid-cols-4 items-center gap-4 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3">
                  <Label htmlFor="exchangeRate" className="text-right">
                    {t('expenses.exchangeRate')}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <div className="col-span-3 space-y-1">
                    <Input
                      id="exchangeRate"
                      type="number"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder="12200"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('expenses.howMany')} {salePriceCurrency} {t('expenses.for')} 1 {companyBaseCurrency}
                    </p>
                  </div>
              </div>
            )}
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="secondary">{t('sales.cancel')}</Button></DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={isSaleDisabled}>
            {isSubmitting ? t('sales.updating') : t('sales.updateSale')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
