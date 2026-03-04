
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
import { Client, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { toMinor, formatMoneyMinor } from '@/lib/money';

interface MakePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onConfirm: (clientId: string, amountMinor: number, currency: Currency, note?: string) => void;
}

export default function MakePaymentDialog({ open, onOpenChange, client, onConfirm }: MakePaymentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const outstandingCurrencies = Object.entries(client.outstandingByCurrency || {})
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
      await onConfirm(client.id, amountMinor, currency, note);
      // Reset form
      setAmount('');
      setNote('');
    } catch (e) {
        // error is shown by parent
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('clients.recordPaymentFor')} {client.name}</DialogTitle>
            <DialogDescription>
              {t('clients.selectTheCurrencyAndEnterTheAmountPaidByTheClient')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount">{t('clients.paymentAmount')} <span className="text-destructive">*</span></Label>
                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isSubmitting}/>
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{t('employees.currency')} <span className="text-destructive">*</span></Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)} disabled={isSubmitting}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('employees.selectCurrency')} />
                  </SelectTrigger>
                  <SelectContent>
                    {outstandingCurrencies.length > 0 ? (
                        outstandingCurrencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)
                    ) : (
                        <>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="AED">AED</SelectItem>
                            <SelectItem value="SAR">SAR</SelectItem>
                            <SelectItem value="JOD">JOD</SelectItem>
                            <SelectItem value="EGP">EGP</SelectItem>
                            <SelectItem value="UZS">UZS</SelectItem>
                            <SelectItem value="CNY">CNY</SelectItem>
                        </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
             {client.outstandingByCurrency?.[currency] ? (
                  <p className="text-sm text-muted-foreground">{t('clients.outstandingIn')} {currency}: {formatMoneyMinor(client.outstandingByCurrency[currency]!, currency)}</p>
              ) : null}
            <div className="space-y-2">
              <Label htmlFor="note">{t('clients.noteOptional')}</Label>
              <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} disabled={isSubmitting}/>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isSubmitting}>{t('clients.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? t('clients.saving') : t('clients.confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
