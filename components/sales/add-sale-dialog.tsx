
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
import { Sale, Product, Client, Seller, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Check, ChevronsUpDown } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface AddSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSale: (sale: Omit<Sale, 'id' | 'createdAt'>) => void;
}

export default function AddSaleDialog({ open, onOpenChange, onAddSale }: AddSaleDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [clientName, setClientName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [salePriceCurrency, setSalePriceCurrency] = useState<Currency | ''>('');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Partial' | 'Loan'>('Cash');
  const [date, setDate] = useState<Date | undefined>(new Date());
  
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [productComboboxOpen, setProductComboboxOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset form when dialog is closed
      setClientName('');
      setProductCode('');
      setSellerId('');
      setQuantity('');
      setSalePrice('');
      setSalePriceCurrency('');
      setPaymentType('Cash');
      setDate(new Date());
    }
  }, [open]);

  const selectedProduct = useMemo(() => {
    return (products || []).find(p => p.productCode === productCode);
  }, [products, productCode]);

  const isSaleDisabled = useMemo(() => {
    if (!selectedProduct) return true; // Disabled if no product is selected
    const saleQuantity = parseInt(quantity, 10);
    if (isNaN(saleQuantity) || saleQuantity <= 0) return true; // Disabled if quantity is invalid
    return selectedProduct.quantity < saleQuantity; // Disabled if not enough stock
  }, [selectedProduct, quantity]);


  const handleSubmit = () => {
    if (!productCode || !sellerId || !quantity || !salePrice || !salePriceCurrency || !date) {
        toast({
            variant: "destructive",
            title: t('missingFields'),
            description: t('pleaseFillAllRequiredFields'),
        });
        return;
    }
    
    if (!selectedProduct) {
        toast({
            variant: "destructive",
            title: t('productNotFound'),
            description: t('theSelectedProductCouldNotBeFound'),
        });
        return;
    }

    const selectedSeller = (sellers || []).find(s => s.id === sellerId);

    const saleData: Omit<Sale, 'id' | 'createdAt'> = {
      clientName: clientName || 'Cash Sale', // Default to 'Cash Sale' if no client is provided
      productName: selectedProduct?.name || '',
      productCode: productCode,
      sellerId: sellerId,
      sellerName: selectedSeller?.name || '',
      quantity: parseInt(quantity, 10) || 0,
      salePrice: parseFloat(salePrice) || 0,
      salePriceCurrency: salePriceCurrency,
      paymentType,
      date: format(date, 'yyyy-MM-dd'),
      total: (parseInt(quantity, 10) || 0) * (parseFloat(salePrice) || 0),
    };
    onAddSale(saleData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('recordSale')}</DialogTitle>
          <DialogDescription>{t('recordSaleDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
             <Label htmlFor="client" className="text-right">{t('clientName')}</Label>
             <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                <PopoverTrigger asChild>
                    <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={clientComboboxOpen}
                    className="col-span-3 justify-between font-normal"
                    >
                    {clientName || t('SELECT OR TYPE CLIENT')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[375px] p-0">
                    <Command>
                        <CommandInput 
                            placeholder={t('searchOrAddClient')}
                            value={clientName}
                            onValueChange={setClientName}
                        />
                        <CommandEmpty>{t('noClientFound')}</CommandEmpty>
                        <CommandGroup>
                            <CommandList>
                                {(clients || []).map((client) => (
                                <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={(currentValue) => {
                                    setClientName(client.name === clientName ? "" : client.name)
                                    setClientComboboxOpen(false)
                                    }}
                                >
                                    <Check
                                    className={cn(
                                        "mr-2 h-4 w-4",
                                        clientName === client.name ? "opacity-100" : "opacity-0"
                                    )}
                                    />
                                    {client.name}
                                </CommandItem>
                                ))}
                            </CommandList>
                        </CommandGroup>
                    </Command>
                </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="product" className="text-right">{t('product')}</Label>
            <Popover open={productComboboxOpen} onOpenChange={setProductComboboxOpen}>
                <PopoverTrigger asChild>
                    <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productComboboxOpen}
                    className="col-span-3 justify-between font-normal"
                    >
                    {productCode
                        ? (products || []).find((p) => p.productCode === productCode)?.name
                        : t('SELECT A PRODUCT')}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[375px] p-0">
                    <Command>
                    <CommandInput placeholder={t('SEARCH PRODUCT BY NAME OR CODE...')} />
                    <CommandList>
                        <CommandEmpty>{t('noProductFound')}</CommandEmpty>
                        <CommandGroup>
                        {(products || []).map((product) => (
                            <CommandItem
                            key={product.id}
                            value={`${product.name} ${product.productCode}`}
                            onSelect={() => {
                                setProductCode(product.productCode);
                                setProductComboboxOpen(false);
                            }}
                            disabled={product.quantity <= 0}
                            >
                            <Check
                                className={cn(
                                "mr-2 h-4 w-4",
                                productCode === product.productCode ? "opacity-100" : "opacity-0"
                                )}
                            />
                            {product.name} ({product.productCode}) - {t('stock')}: {product.quantity}
                            </CommandItem>
                        ))}
                        </CommandGroup>
                    </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="seller" className="text-right">{t('seller')}</Label>
            <Select onValueChange={setSellerId} value={sellerId}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectSeller')} />
              </SelectTrigger>
              <SelectContent>
                {(sellers || []).filter(s => s.status === 'active').map(seller => (
                  <SelectItem key={seller.id} value={seller.id!}>{seller.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="quantity" className="text-right">{t('quantity')}</Label>
            <Input id="quantity" type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sale-price" className="text-right">{t('salePrice')}</Label>
            <Input id="sale-price" type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sale-price-currency" className="text-right">{t('currency')}</Label>
             <Select onValueChange={(v) => setSalePriceCurrency(v as Currency)} value={salePriceCurrency}>
                <SelectTrigger className="col-span-3"><SelectValue placeholder={t('selectCurrency')} /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="UZS">UZS</SelectItem>
                </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="payment-type" className="text-right">{t('paymentType')}</Label>
            <Select onValueChange={(value) => setPaymentType(value as 'Cash' | 'Partial' | 'Loan')} value={paymentType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectPaymentType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">{t('cash')}</SelectItem>
                <SelectItem value="Partial">{t('partial')}</SelectItem>
                <SelectItem value="Loan">{t('loan')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="date" className="text-right">{t('date')}</Label>
            <Popover>
                <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>{t('pickADate')}</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                />
                </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">{t('cancel')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={isSaleDisabled}>{t('recordSale')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
