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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Supplier, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { toMinor, formatMoneyMinor } from '@/lib/money';

interface MakeSupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
  onConfirm: (supplierId: string, amountMinor: number, currency: Currency, note?: string) => Promise<void>;
}

export default function MakeSupplierPaymentDialog({ open, onOpenChange, supplier, onConfirm }: MakeSupplierPaymentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const outstandingCurrencies = Object.entries(supplier.balanceDueByCurrency || {})
    .filter(([_, value]) => value > 0)
    .map(([key]) => key as Currency);

  const handleSubmit = async () => {
    if (!amount || !currency) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields') });
      return;
    }
    const amountMinor = toMinor(parseFloat(amount), currency);
    if (amountMinor <= 0) {
      toast({ variant: 'destructive', title: t('toast.error.invalidAmount') });
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(supplier.id, amountMinor, currency, note);
      // Clear ONLY after success
      setAmount('');
      setNote('');
    } catch (err) {
      // Keep input so user can retry
      console.error('[MakeSupplierPaymentDialog] payment failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('suppliers.recordPaymentTo', { name: supplier.name })}</DialogTitle>
            <DialogDescription>
              {t('suppliers.selectTheCurrencyAndEnterTheAmountPaidToTheSupplier')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">{t('suppliers.paymentAmount')} <span className="text-destructive">*</span></Label>
                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('label.currency')} <span className="text-destructive">*</span></Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)} disabled={isSubmitting}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('placeholder.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {outstandingCurrencies.length > 0 ? (
                        outstandingCurrencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                    ) : (
                        <>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="AED">AED</SelectItem>
                            <SelectItem value="UZS">UZS</SelectItem>
                            <SelectItem value="CNY">CNY</SelectItem>
                        </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
             {supplier.balanceDueByCurrency?.[currency] ? (
                  <p className="text-sm text-muted-foreground">{t('suppliers.balanceDueIn')} {currency}: {formatMoneyMinor(supplier.balanceDueByCurrency[currency]!, currency)}</p>
              ) : null}
            <div className="space-y-2">
              <Label htmlFor="note">{t('suppliers.noteOptional')}</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} disabled={isSubmitting} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isSubmitting}>{t('suppliers.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? t('suppliers.saving') : t('suppliers.confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
