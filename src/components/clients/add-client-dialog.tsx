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
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Client } from '@/lib/types';

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddClient: (client: Omit<Client, 'id' | 'companyId' | 'createdAt'>) => void;
}

export default function AddClientDialog({ open, onOpenChange, onAddClient }: AddClientDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: t('toast.error.missingFields'),
        description: t('clients.pleaseEnterAClientName'),
      });
      return;
    }
    onAddClient({ name, phoneNumber, location });
    setName('');
    setPhoneNumber('');
    setLocation('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('clients.createNewClient')}</DialogTitle>
            <DialogDescription>{t('clients.addANewClientToYourRecords')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="clientName">{t('clients.clientName')} <span className="text-destructive">*</span></Label>
              <Input id="clientName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">{t('clients.phoneNumber')}</Label>
              <Input id="phoneNumber" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">{t('clients.location')}</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">{t('clients.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('clients.addClient')}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
