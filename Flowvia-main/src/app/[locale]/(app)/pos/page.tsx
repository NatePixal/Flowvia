'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Client, Currency, Location, Product, Seller } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Button } from '@/components/ui/button';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import BarcodeScannerDialog from '@/components/barcode/barcode-scanner-dialog';
import { openShiftFn, closeShiftFn, recordSaleFifoFn } from '@/lib/flowvia-functions';
import { serverTimestamp, addDoc } from 'firebase/firestore';
import { companyCollection, withCompanyId } from '@/lib/firestore-path';
import { normalizeProductCode } from '@/lib/normalize';
import { formatMoneyMinor, toMinor } from '@/lib/money';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type CartItem = {
  productId: string;
  productCode: string;
  name: string;
  qty: number;
  unitPrice: number;
};

function sum(items: CartItem[]) {
  return items.reduce((acc, it) => acc + it.qty * it.unitPrice, 0);
}

export default function PosPage() {
  const { t } = useTranslation();
  const { firestore, companyId, companyBaseCurrency, userProfile, locationsEnabled, posEnabled } = useFirebase();
  const { toast } = useToast();

  const canView = hasPermission(userProfile, 'pos', 'view');
  const canCreate = hasPermission(userProfile, 'pos', 'create');

  const { data: products } = useCompanyCollection<Product>('products');
  const { data: locations } = useCompanyCollection<Location>('locations');
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');

  const baseCurrency = (companyBaseCurrency || 'USD') as Currency;

  const [locationId, setLocationId] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [scanOpen, setScanOpen] = useState(false);

  const [currency, setCurrency] = useState<Currency>(baseCurrency);
  const [fxRate, setFxRate] = useState('');

  const [discount, setDiscount] = useState('0');
  const [vatRate, setVatRate] = useState('0');

  const [paymentType, setPaymentType] = useState<'Cash' | 'Partial' | 'Loan'>('Cash');
  const [paidAtSale, setPaidAtSale] = useState('0');

  const [shiftId, setShiftId] = useState<string>('');
  const [openCash, setOpenCash] = useState('0');
  const [closeCash, setCloseCash] = useState('0');

  const [receipt, setReceipt] = useState<any | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  const selectedClient = useMemo(() => (clients || []).find(c => c.id === clientId) || null, [clients, clientId]);

  const selectedSeller = useMemo(() => (sellers || []).find(s => s.id === sellerId) || null, [sellers, sellerId]);

  const subtotal = useMemo(() => sum(cart), [cart]);
  const discountMajor = useMemo(() => Number(discount) || 0, [discount]);
  const vat = useMemo(() => Number(vatRate) || 0, [vatRate]);

  const totalMajor = useMemo(() => {
    const taxable = Math.max(0, subtotal - discountMajor);
    const vatAmount = taxable * vat;
    return taxable + vatAmount;
  }, [subtotal, discountMajor, vat]);

  async function createClientIfNeeded(): Promise<string> {
    if (clientId) return clientId;
    const name = clientSearch.trim();
    if (!name) throw new Error(t('toast.error.clientIsRequired'));
    if (!firestore || !companyId) throw new Error(t('toast.error.companyIdMissingError'));

    const existing = (clients || []).find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setClientId(existing.id);
      return existing.id;
    }

    const ref = companyCollection(firestore, companyId, 'clients');
    const docRef = await addDoc(ref, withCompanyId(companyId, {
      name,
      createdAt: serverTimestamp(),
      outstandingByCurrency: {},
      openPurchasesCount: 0,
    }));

    setClientId(docRef.id);
    return docRef.id;
  }

  function addToCartByProductCode(codeRaw: string) {
    const code = normalizeProductCode(codeRaw);
    if (!code) return;

    const p = (products || []).find(x => (x.barcode || x.productCode).toUpperCase() === code.toUpperCase() || x.productCode.toUpperCase() === code.toUpperCase());
    if (!p) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.productNotFoundByBarcode', { code }) });
      return;
    }

    setCart(prev => {
      const idx = prev.findIndex(it => it.productId === p.id);
      const unitPrice = Number(p.sellingPrice || 0);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { productId: p.id, productCode: p.productCode, name: p.name, qty: 1, unitPrice }];
    });
  }

  function updateQty(productId: string, qty: number) {
    setCart(prev => prev.map(it => it.productId === productId ? { ...it, qty: Math.max(1, Math.floor(qty)) } : it));
  }

  function updatePrice(productId: string, price: number) {
    setCart(prev => prev.map(it => it.productId === productId ? { ...it, unitPrice: Math.max(0, price) } : it));
  }

  function removeItem(productId: string) {
    setCart(prev => prev.filter(it => it.productId !== productId));
  }

  async function openShift() {
    if (!companyId) return;
    if (!locationId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.locationRequired') });
      return;
    }
    try {
      const res: any = await openShiftFn({ companyId, locationId, openingCash: Number(openCash) || 0 });
      setShiftId(String(res.shiftId));
      toast({ title: t('pos.shiftOpened'), description: t('pos.shiftOpenedDesc') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  }

  async function closeShift() {
    if (!companyId || !shiftId || !locationId) return;
    try {
      const res: any = await closeShiftFn({ companyId, locationId, shiftId, closingCash: Number(closeCash) || 0 });
      toast({ title: t('pos.shiftClosed'), description: t('pos.shiftClosedDesc', { cashSales: res.cashSalesBaseMinor }) });
      setShiftId('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  }

  async function checkout() {
    if (!companyId) return;
    if (!canCreate) return;
    if (!locationsEnabled) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.enableLocationsFirst') });
      return;
    }
    if (!locationId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.locationRequired') });
      return;
    }
    if (!sellerId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.sellerRequired') });
      return;
    }
    if (cart.length === 0) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.cartEmpty') });
      return;
    }

    try {
      const finalClientId = await createClientIfNeeded();

      const fx = currency !== baseCurrency ? {
        rateToBase: Number(fxRate) || 0,
        enteredRate: Number(fxRate) || 0,
        enteredPair: `${baseCurrency}->${currency}`,
        capturedAt: serverTimestamp(),
      } : undefined;

      if (currency !== baseCurrency && (!fx || !fx.rateToBase || fx.rateToBase <= 0)) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: t('pos.fxRequired') });
        return;
      }

      const payload = {
        companyId,
        locationId,
        clientId: finalClientId,
        sellerId,
        sellerName: selectedSeller?.name || '',
        paymentType,
        currency,
        fx,
        discount: Number(discount) || 0,
        vatRate: Number(vatRate) || 0,
        paidAtSale: Number(paidAtSale) || 0,
        shiftId: shiftId || undefined,
        items: cart.map(it => ({ productId: it.productId, quantity: it.qty, unitPrice: it.unitPrice })),
      };

      const res: any = await recordSaleFifoFn(payload as any);

      toast({ title: t('pos.saleRecorded'), description: t('pos.saleRecordedDesc', { id: res.saleId }) });

      // Store local receipt snapshot for printing
      setReceipt({
        ...payload,
        saleId: res.saleId,
        subtotal,
        total: totalMajor,
        clientName: selectedClient?.name || clientSearch,
        sellerName: selectedSeller?.name || '',
      });
      setReceiptOpen(true);

      setCart([]);
      setClientId('');
      setClientSearch('');
      setPaidAtSale('0');
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  }

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('pos.title')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  if (!posEnabled) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('pos.title')}</h1>
        <p className="text-muted-foreground">{t('pos.posDisabled')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('pos.title')}</h1>
        <p className="text-muted-foreground">{t('pos.desc')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FancyCard className="lg:col-span-1">
          <CardHeader>
            <CardTitle>{t('pos.setupTitle')}</CardTitle>
            <CardDescription>{t('pos.setupDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t('pos.location')}</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('pos.selectLocation')} />
                </SelectTrigger>
                <SelectContent>
                  {(locations || []).filter(l => l.active !== false).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('pos.seller')}</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('pos.selectSeller')} />
                </SelectTrigger>
                <SelectContent>
                  {(sellers || []).filter(s => s.status === 'active').map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('pos.client')}</Label>
              <Input value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); setClientId(''); }} placeholder={t('pos.clientPlaceholder')} />
              {clientSearch && (
                <div className="text-xs text-muted-foreground">
                  {t('pos.clientHint')}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('pos.currency')}</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={baseCurrency}>{baseCurrency}</SelectItem>
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
              <div className="space-y-2">
                <Label>{t('pos.fxRate')}</Label>
                <Input value={fxRate} onChange={(e) => setFxRate(e.target.value)} disabled={currency === baseCurrency} placeholder={currency === baseCurrency ? t('pos.fxNotNeeded') : t('pos.fxPlaceholder')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('pos.discount')}</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('pos.vatRate')}</Label>
                <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} placeholder="0.15" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('pos.paymentType')}</Label>
              <Select value={paymentType} onValueChange={(v) => setPaymentType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">{t('sales.cash')}</SelectItem>
                  <SelectItem value="Partial">{t('sales.partial')}</SelectItem>
                  <SelectItem value="Loan">{t('sales.loan')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentType === 'Partial' && (
              <div className="space-y-2">
                <Label>{t('pos.paidAtSale')}</Label>
                <Input type="number" value={paidAtSale} onChange={(e) => setPaidAtSale(e.target.value)} />
              </div>
            )}

            <div className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium">{t('pos.shift')}</div>
              {!shiftId ? (
                <div className="space-y-2">
                  <Label>{t('pos.openingCash')}</Label>
                  <Input type="number" value={openCash} onChange={(e) => setOpenCash(e.target.value)} />
                  <Button className="w-full" onClick={openShift} disabled={!locationId}>{t('pos.openShift')}</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">{t('pos.shiftOpenId', { id: shiftId })}</div>
                  <Label>{t('pos.closingCash')}</Label>
                  <Input type="number" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} />
                  <Button className="w-full" variant="outline" onClick={closeShift}>{t('pos.closeShift')}</Button>
                </div>
              )}
            </div>
          </CardContent>
        </FancyCard>

        <FancyCard className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle>{t('pos.cartTitle')}</CardTitle>
                <CardDescription>{t('pos.cartDesc')}</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setScanOpen(true)}>
                  {t('pos.scan')}
                </Button>
                <Button onClick={checkout} disabled={!canCreate}>
                  {t('pos.checkout')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('pos.manualCode')}</Label>
                <div className="flex gap-2">
                  <Input placeholder={t('pos.manualCodePlaceholder')} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const code = (e.target as HTMLInputElement).value;
                      (e.target as HTMLInputElement).value = '';
                      addToCartByProductCode(code);
                    }
                  }} />
                  <Button variant="outline" onClick={() => setScanOpen(true)}>{t('pos.scan')}</Button>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t('pos.summary')}</div>
                <div className="text-sm">{t('pos.subtotal')}: <span className="font-medium">{subtotal.toFixed(2)}</span></div>
                <div className="text-sm">{t('pos.discount')}: <span className="font-medium">{discountMajor.toFixed(2)}</span></div>
                <div className="text-sm">{t('pos.total')}: <span className="font-semibold">{totalMajor.toFixed(2)}</span></div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('pos.product')}</TableHead>
                    <TableHead className="w-[120px]">{t('pos.qty')}</TableHead>
                    <TableHead className="w-[140px]">{t('pos.price')}</TableHead>
                    <TableHead className="w-[140px]">{t('pos.lineTotal')}</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.map((it) => (
                    <TableRow key={it.productId}>
                      <TableCell className="font-medium">{it.name}</TableCell>
                      <TableCell>
                        <Input type="number" value={it.qty} onChange={(e) => updateQty(it.productId, Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={it.unitPrice} onChange={(e) => updatePrice(it.productId, Number(e.target.value))} />
                      </TableCell>
                      <TableCell>{(it.qty * it.unitPrice).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => removeItem(it.productId)}>
                          {t('misc.delete')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {cart.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">{t('pos.cartEmpty')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </FancyCard>
      </div>

      <BarcodeScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => addToCartByProductCode(code)}
      />

      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('pos.receiptTitle')}</DialogTitle>
            <DialogDescription>{t('pos.receiptDesc')}</DialogDescription>
          </DialogHeader>

          {receipt && (
            <div className="rounded-md border p-4 bg-white text-black">
              <div className="text-center font-semibold">FlowVia POS</div>
              <div className="text-xs text-center">{receipt.saleId}</div>
              <div className="mt-3 text-xs">
                <div>{t('pos.client')}: {receipt.clientName}</div>
                <div>{t('pos.seller')}: {receipt.sellerName}</div>
              </div>
              <div className="mt-3 border-t pt-2">
                {receipt.items.map((it: any) => (
                  <div key={it.productId} className="flex justify-between text-xs">
                    <span>{it.quantity} x {it.productId}</span>
                    <span>{(it.quantity * it.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t pt-2 text-xs">
                <div className="flex justify-between"><span>{t('pos.subtotal')}</span><span>{receipt.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>{t('pos.discount')}</span><span>{Number(receipt.discount || 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-semibold"><span>{t('pos.total')}</span><span>{Number(receipt.total || 0).toFixed(2)}</span></div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>{t('misc.close')}</Button>
            <Button onClick={() => window.print()}>{t('pos.printReceipt')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
