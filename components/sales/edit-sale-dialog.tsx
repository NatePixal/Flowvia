
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
  DialogDescription
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sale, Product, Client, Seller, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale;
  onUpdateSale: (saleId: string, updatedData: Partial<Sale>) => void;
  products: Product[];
  clients: Client[];
  sellers: Seller[];
}

export default function EditSaleDialog({ open, onOpenChange, sale, onUpdateSale, products, clients, sellers }: EditSaleDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [clientName, setClientName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [salePriceCurrency, setSalePriceCurrency] = useState<Currency | ''>('');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Partial' | 'Loan'>('Cash');
  const [date, setDate] = useState<Date | undefined>();

  useEffect(() => {
    if (sale) {
      setClientName(sale.clientName);
      setProductCode(sale.productCode);
      setSellerId(sale.sellerId);
      setQuantity(String(sale.quantity));
      setSalePrice(String(sale.salePrice));
      setSalePriceCurrency(sale.salePriceCurrency);
      setPaymentType(sale.paymentType as 'Cash' | 'Partial' | 'Loan');
      const saleDate = sale.date instanceof Timestamp ? sale.date.toDate() : new Date(sale.date);
      setDate(saleDate);
    }
  }, [sale]);

  const handleSubmit = () => {
    if (!sale?.id) return;
    
    if (!clientName || !productCode || !sellerId || !quantity || !salePrice || !salePriceCurrency || !date) {
        toast({
            variant: "destructive",
            title: t('missingFields'),
            description: t('pleaseFillAllRequiredFields'),
        });
        return;
    }

    const selectedSeller = sellers.find(s => s.id === sellerId);

    const updatedData: Partial<Sale> = {
      clientName,
      productCode,
      sellerId,
      sellerName: selectedSeller?.name || '',
      quantity: parseInt(quantity, 10),
      salePrice: parseFloat(salePrice),
      salePriceCurrency,
      paymentType: paymentType,
      date: date ? format(date, 'yyyy-MM-dd') : undefined,
    };
    onUpdateSale(sale.id, updatedData);
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('editSale')}</DialogTitle>
          <DialogDescription>{t('updateTheDetailsOfThisSale')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="client" className="text-right">{t('clientName')}</Label>
            <Select onValueChange={setClientName} value={clientName}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectClient')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.name}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="product" className="text-right">{t('product')}</Label>
            <Select onValueChange={setProductCode} value={productCode} disabled>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectProduct')} />
              </SelectTrigger>
              <SelectContent>
                {products.map(product => (
                  <SelectItem key={product.id} value={product.productCode}>{product.name} ({product.productCode})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="seller" className="text-right">{t('seller')}</Label>
            <Select onValueChange={setSellerId} value={sellerId}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectSeller')} />
              </SelectTrigger>
              <SelectContent>
                {sellers.filter(s => s.status === 'active').map(seller => (
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
          <Button type="button" onClick={handleSubmit}>{t('saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
