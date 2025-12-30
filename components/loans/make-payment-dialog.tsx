
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
import { Client } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MakePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMakePayment: (paymentData: { clientId: string; amount: number; method: "Cash" | "Bank" | "Other"; reference?: string; date: Date }) => void;
  clients: Client[];
}

export default function MakePaymentDialog({ open, onOpenChange, onMakePayment, clients }: MakePaymentDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [selectedClientId, setSelectedClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [method, setMethod] = useState<'Cash' | 'Bank' | 'Other'>('Cash');
  const [reference, setReference] = useState('');


  const handleSubmit = () => {
    const paymentAmount = parseFloat(amount);
    if (!selectedClientId || isNaN(paymentAmount) || paymentAmount <= 0 || !paymentDate) {
        toast({
            variant: "destructive",
            title: t('invalidInput'),
            description: t('pleaseFillAllFieldsCorrectly'),
        });
        return;
    }
    
    onMakePayment({
      clientId: selectedClientId,
      amount: paymentAmount,
      method,
      reference,
      date: paymentDate,
    });

    // Reset form
    setSelectedClientId('');
    setAmount('');
    setPaymentDate(new Date());
    setMethod('Cash');
    setReference('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('makePayment')}</DialogTitle>
          <DialogDescription>{t('makePaymentDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="client" className="text-right">{t('client')}</Label>
            <Select onValueChange={setSelectedClientId} value={selectedClientId}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectClient')} />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id!}>{client.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">{t('amountPaid')}</Label>
            <Input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} className="col-span-3" />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="method" className="text-right">{t('paymentMethod')}</Label>
            <Select onValueChange={(value: 'Cash' | 'Bank' | 'Other') => setMethod(value)} value={method}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder={t('selectPaymentMethod')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">{t('cash')}</SelectItem>
                <SelectItem value="Bank">{t('bank')}</SelectItem>
                <SelectItem value="Other">{t('other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="reference" className="text-right">{t('reference')}</Label>
            <Input id="reference" value={reference} onChange={e => setReference(e.target.value)} className="col-span-3" placeholder={t('optionalReference')} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="paymentDate" className="text-right">{t('paymentDate')}</Label>
            <Popover>
                <PopoverTrigger asChild>
                <Button
                    variant={"outline"}
                    className={cn(
                    "col-span-3 justify-start text-left font-normal",
                    !paymentDate && "text-muted-foreground"
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, "PPP") : <span>{t('pickADate')}</span>}
                </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={setPaymentDate}
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
          <Button type="button" onClick={handleSubmit}>{t('recordPayment')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
