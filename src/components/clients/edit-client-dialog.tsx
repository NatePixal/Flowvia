
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
import { Client, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase';
import { addClientLegacyDebtToLedger } from '@/lib/ledger-recompute';
import { Separator } from '../ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onUpdateClient: (clientId: string, data: Partial<Client>) => void;
}

export default function EditClientDialog({ open, onOpenChange, client, onUpdateClient }: EditClientDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { firestore, companyId } = useFirebase();
  
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');

  // State for legacy debt
  const [debtAmount, setDebtAmount] = useState('');
  const [debtCurrency, setDebtCurrency] = useState<Currency>('USD');
  const [debtDate, setDebtDate] = useState<Date | undefined>(new Date());
  const [debtNote, setDebtNote] = useState('');
  const [isAddingDebt, setIsAddingDebt] = useState(false);

  useEffect(() => {
    if (client) {
      setName(client.name);
      setPhoneNumber(client.phoneNumber || '');
      setLocation(client.location || '');
    }
    // Reset debt form when dialog opens for a new client
    setDebtAmount('');
    setDebtCurrency('USD');
    setDebtDate(new Date());
    setDebtNote('');
  }, [client, open]);

  const handleSubmit = () => {
    if (!name) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('clients.clientNameIsRequired') });
      return;
    }
    onUpdateClient(client.id, { name, phoneNumber, location });
  };

  const handleAddDebt = async () => {
    if (!debtAmount || !debtCurrency || !debtDate) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields') });
      return;
    }
    if (!firestore || !companyId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
      return;
    }
    
    setIsAddingDebt(true);
    try {
      await addClientLegacyDebtToLedger(
        firestore,
        companyId,
        client.id,
        parseFloat(debtAmount),
        debtCurrency,
        debtDate,
        debtNote
      );
      toast({ title: t('toast.success.debtAdded'), description: t('toast.success.debtAddedSuccessMessage') });
      // Reset debt form
      setDebtAmount('');
      setDebtNote('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    } finally {
      setIsAddingDebt(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('clients.editClient')}</DialogTitle>
            <DialogDescription>{t('clients.editTheDetailsForThisClient')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('clients.clientName')} <span className="text-destructive">*</span></Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('clients.phoneNumber')}</Label>
              <Input id="phone" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{t('clients.location')}</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('misc.done')}</Button>
            <Button type="button" onClick={handleSubmit}>{t('clients.saveChanges')}</Button>
          </DialogFooter>

          <Separator className="my-4" />

          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>{t('clients.addDebt')}</DialogTitle>
              <DialogDescription>{t('clients.addLegacyDebtDescription')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="debt-amount">{t('clients.debtAmount')}</Label>
                  <Input id="debt-amount" type="number" value={debtAmount} onChange={(e) => setDebtAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="debt-currency">{t('employees.currency')}</Label>
                  <Select value={debtCurrency} onValueChange={(v) => setDebtCurrency(v as Currency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="AED">AED</SelectItem>
                      <SelectItem value="UZS">UZS</SelectItem>
                      <SelectItem value="CNY">CNY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-date">{t('clients.debtDate')}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={cn("w-full justify-start text-left font-normal", !debtDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {debtDate ? format(debtDate, "PPP") : <span>{t('placeholder.pickADate')}</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={debtDate} onSelect={setDebtDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-note">{t('clients.debtNote')}</Label>
                <Input id="debt-note" value={debtNote} onChange={(e) => setDebtNote(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddDebt} disabled={isAddingDebt}>
                {isAddingDebt ? t('misc.saving') : t('clients.addDebtButton')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
    </Dialog>
  );
}
