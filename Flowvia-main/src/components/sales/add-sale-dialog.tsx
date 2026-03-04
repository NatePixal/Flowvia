'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sale, Product, Client, Seller, Currency, ClientLedgerEntry, FxSnapshot, Location } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import ru from 'date-fns/locale/ru';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { toMinor, fromMinor, formatMoneyMinor, normalizeRateToBase } from '@/lib/money';
import { companyCollection, withCompanyId } from '@/lib/firestore-path';


interface AddSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSale: (saleData: any) => Promise<void>;
}

export default function AddSaleDialog({ open, onOpenChange, onAddSale }: AddSaleDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { firestore, companyId, companyBaseCurrency, locationsEnabled } = useFirebase();

  const [clientId, setClientId] = useState('');
  const [productCode, setProductCode] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [salePriceCurrency, setSalePriceCurrency] = useState<Currency>('USD');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Partial' | 'Loan'>('Cash');
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exchangeRate, setExchangeRate] = useState('');
  const [locationId, setLocationId] = useState('');
  
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  const { data: locations } = useCompanyCollection<Location>('locations');
  
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [productComboboxOpen, setProductComboboxOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  
  const resetForm = () => {
    setClientId(''); setProductCode(''); setSellerId('');
    setQuantity(''); setSalePrice(''); setSalePriceCurrency('USD');
    setPaymentType('Cash'); setDate(new Date()); setClientSearch('');
    setExchangeRate(''); setLocationId(''); setIsSubmitting(false);
  }

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);
  
  const selectedProduct = useMemo(() => {
    return (products || []).find(p => p.productCode === productCode);
  }, [products, productCode]);

  const selectedClient = useMemo(() => {
    return (clients || []).find(c => c.id === clientId);
  }, [clients, clientId]);
  
  const clientInputValue = selectedClient ? selectedClient.name : clientSearch;

  const showFxInput = useMemo(() => salePriceCurrency && companyBaseCurrency && salePriceCurrency !== companyBaseCurrency, [salePriceCurrency, companyBaseCurrency]);
  const fxPair = useMemo(() => `${companyBaseCurrency}->${salePriceCurrency}`, [companyBaseCurrency, salePriceCurrency]);

  const isSaleDisabled = useMemo(() => {
    if (isSubmitting || !selectedProduct) return true;
    const saleQuantity = parseInt(quantity, 10);
    if (isNaN(saleQuantity) || saleQuantity <= 0) return true;
    if (showFxInput && !exchangeRate) return true;
    return selectedProduct.quantity < saleQuantity;
  }, [selectedProduct, quantity, isSubmitting, showFxInput, exchangeRate]);

  async function createClientIfNeeded(): Promise<string> {
    if (clientId) return clientId;
    
    const newName = clientSearch.trim();
    if (!newName) return Promise.reject(new Error(t('toast.error.clientIsRequired')));

    if (!firestore || !companyId) return Promise.reject(new Error(t('toast.error.companyIdMissingError')));
    
    const existing = clients.find(c => c.name.toLowerCase() === newName.toLowerCase());
    if (existing) {
        setClientId(existing.id); 
        return existing.id;
    }

    const clientsRef = companyCollection(firestore, companyId, 'clients');
    const docData = withCompanyId(companyId, {
      name: newName,
      createdAt: serverTimestamp(),
      outstandingByCurrency: {},
      openPurchasesCount: 0,
    });

    const docRef = await addDoc(clientsRef, docData);
    toast({ title: t('toast.success.clientCreated'), description: t('toast.success.clientCreatedWithName', { name: newName }) });
    return docRef.id;
  }


  const handleSubmit = async () => {
    if (!productCode || !sellerId || !quantity || !salePrice || !salePriceCurrency) {
        toast({ variant: "destructive", title: t('toast.error.missingFields') });
        return;
    }
    if (locationsEnabled && !locationId) {
      toast({ variant: "destructive", title: t('toast.error.missingFields'), description: t('sales.locationRequired') });
      return;
    }

    if (showFxInput && (!exchangeRate || parseFloat(exchangeRate) <= 0)) {
      toast({ variant: "destructive", title: t('toast.error.exchangeRateRequired') });
      return;
    }
    
    if (!selectedProduct) {
        toast({ variant: "destructive", title: t('toast.error.productNotFound') });
        return;
    }

    setIsSubmitting(true);
    try {
        const finalClientId = await createClientIfNeeded();

        const salePayload: any = {
            clientId: finalClientId,
            productId: selectedProduct.id,
            quantity: parseInt(quantity, 10),
            salePrice: parseFloat(salePrice),
            salePriceCurrency,
            paymentType,
            date,
            sellerId,
            locationId
        };
        
        if (showFxInput && companyBaseCurrency) {
            const enteredRate = parseFloat(exchangeRate);
            const enteredPair = fxPair;
            const rateToBase = normalizeRateToBase(enteredRate, enteredPair, salePriceCurrency, companyBaseCurrency);
            
            salePayload.fx = {
              rateToBase,
              enteredRate,
              enteredPair,
              capturedAt: serverTimestamp(),
            } as FxSnapshot;
        }

        await onAddSale(salePayload);
        onOpenChange(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sales.recordSale')}</DialogTitle>
          <DialogDescription>{t('sales.recordSaleDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
               <Label htmlFor="client" className="text-right">{t('sales.clientName')}</Label>
               <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="col-span-3 justify-between font-normal">
                          <span className="truncate">{clientInputValue || t('sales.selectOrCreateClient')}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[375px] p-0">
                      <Command>
                          <CommandInput 
                              placeholder={t('sales.searchOrAddClient')}
                              value={clientSearch}
                              onValueChange={(search) => {
                                  setClientSearch(search);
                                  setClientId('');
                              }}
                          />
                          <CommandList>
                              <CommandEmpty>
                                  <div className="p-2 text-sm text-center">
                                      {t('sales.noClientFound')}
                                      <Button variant="link" className="p-1 h-auto" onClick={() => setClientComboboxOpen(false)}>
                                          {t('sales.createClientWithName', { name: clientSearch })}
                                      </Button>
                                  </div>
                              </CommandEmpty>
                              <CommandGroup>
                                  {(clients || []).filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).map((client) => (
                                  <CommandItem key={client.id} value={client.name} onSelect={() => {
                                      setClientId(client.id); setClientSearch(client.name); setClientComboboxOpen(false);
                                  }}>
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
              <Popover open={productComboboxOpen} onOpenChange={setProductComboboxOpen}>
                  <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="col-span-3 justify-between font-normal">
                      {productCode ? products?.find(p => p.productCode === productCode)?.name : t('sales.selectProduct')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[375px] p-0">
                      <Command>
                          <CommandInput placeholder={t('sales.searchProduct')} />
                          <CommandList>
                              <CommandEmpty>{t('sales.noProductFound')}</CommandEmpty>
                              <CommandGroup>
                              {products?.map((product) => (
                                  <CommandItem key={product.id} value={`${product.name} ${product.productCode}`} onSelect={() => {
                                      setProductCode(product.productCode); setProductComboboxOpen(false);
                                  }}>
                                      <Check className={cn("mr-2 h-4 w-4", productCode === product.productCode ? "opacity-100" : "opacity-0")} />
                                      {product.name} ({t('inventory.stock')}: {product.quantity})
                                  </CommandItem>
                              ))}
                              </CommandGroup>
                          </CommandList>
                      </Command>
                  </PopoverContent>
              </Popover>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="payment-type" className="text-right">{t('sales.paymentType')}</Label>
              <Select onValueChange={(v) => setPaymentType(v as 'Cash'|'Loan')} value={paymentType}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">{t('sales.cash')}</SelectItem>
                  <SelectItem value="Loan">{t('sales.loan')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">{t('sales.quantity')}</Label>
              <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="col-span-3" />
            </div>

            {selectedProduct && (
              <div className="grid grid-cols-4 items-center gap-4 rounded-md border bg-muted p-3">
                <Label htmlFor="boughtPrice" className="text-right text-muted-foreground">{t('sales.boughtPrice')}</Label>
                <div className="col-span-3 text-sm font-medium text-muted-foreground">
                  {formatMoneyMinor(toMinor(selectedProduct.purchasePrice, selectedProduct.purchasePriceCurrency), selectedProduct.purchasePriceCurrency)}
                </div>
              </div>
            )}

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

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="seller" className="text-right">{t('sales.seller')}</Label>
                <Select onValueChange={setSellerId} value={sellerId}>
                    <SelectTrigger className="col-span-3"><SelectValue placeholder={t('sales.selectSeller')} /></SelectTrigger>
                    <SelectContent>
                        {sellers?.map((seller) => <SelectItem key={seller.id} value={seller.id}>{seller.name}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="date" className="text-right">{t('sales.date')}</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                    <Button variant={"outline"} className={cn("col-span-3 justify-start text-left font-normal", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>{t('placeholder.pickADate')}</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={date}
                          onSelect={setDate}
                          initialFocus
                          locale={i18n.language === 'ru' ? ru : undefined}
                        />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="secondary">{t('sales.cancel')}</Button></DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={isSaleDisabled}>
            {isSubmitting ? t('sales.recording') : t('sales.recordSale')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
