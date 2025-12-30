
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientLoan, Client, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';


interface EditLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loan: ClientLoan;
  onUpdateLoan: (updatedData: { loanAmount: number, currency: Currency, description: string }) => void;
  clients: Client[];
}

export default function EditLoanDialog({ open, onOpenChange, loan, onUpdateLoan, clients }: EditLoanDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [description, setDescription] = useState('');

  useEffect(() => {
      if (loan) {
          setClientId(loan.clientId);
          setAmount(String(loan.loanAmount));
          setCurrency(loan.currency);
          setDescription(loan.description);
      }
  }, [loan]);

  const handleSubmit = () => {
    if (!clientId || !amount || !currency) {
        toast({
            variant: "destructive",
            title: t('missingFields'),
            description: t('pleaseFillAllRequiredFields'),
        });
        return;
    }
    const loanData = {
      loanAmount: parseFloat(amount),
      currency,
      description,
    };
    onUpdateLoan(loanData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editLoan')}</DialogTitle>
           <DialogDescription>{t('editTheDetailsOfTheLoan')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client">{t('clientName')}</Label>
            <Select onValueChange={setClientId} value={clientId} disabled>
              <SelectTrigger>
                <SelectValue placeholder={t('selectClient')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id!}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className='space-y-2'>
                <Label htmlFor="amount">{t('amount')}</Label>
                <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="currency">{t('currency')}</Label>
                <Select onValueChange={(v) => setCurrency(v as Currency)} value={currency}>
                    <SelectTrigger><SelectValue placeholder={t('selectCurrency')} /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="AED">AED</SelectItem>
                        <SelectItem value="UZS">UZS</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t('description')}</Label>
            <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} />
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
