
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientLoan, Client, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';


interface AddLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddLoan: (loan: Omit<ClientLoan, 'id' | 'createdAt'>) => void;
  clients: Client[];
}

export default function AddLoanDialog({ open, onOpenChange, onAddLoan, clients }: AddLoanDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [description, setDescription] = useState('');

  const handleSubmit = () => {
    if (!clientId || !amount || !currency) {
        toast({
            variant: "destructive",
            title: t('missingFields'),
            description: t('pleaseFillAllRequiredFields'),
        });
        return;
    }
    const loanData: Omit<ClientLoan, 'id' | 'createdAt'> = {
      clientId,
      loanAmount: parseFloat(amount),
      currency,
      description,
      loanIssueDate: new Date().toISOString(),
      dueDate: new Date().toISOString(), // Placeholder
      amountPaid: 0,
      remainingBalance: parseFloat(amount)
    };
    onAddLoan(loanData);
    setClientId('');
    setAmount('');
    setCurrency('');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('newLoan')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="client">{t('clientName')}</Label>
            <Select onValueChange={setClientId} value={clientId}>
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
          <Button type="button" onClick={handleSubmit}>{t('createLoan')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
