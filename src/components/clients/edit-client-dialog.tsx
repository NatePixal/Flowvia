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
import { Client } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onUpdateClient: (clientId: string, data: Partial<Client>) => void;
}

export default function EditClientDialog({ open, onOpenChange, client, onUpdateClient }: EditClientDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (client) {
      setName(client.name);
      setPhoneNumber(client.phoneNumber || '');
      setLocation(client.location || '');
    }
  }, [client]);

  const handleSubmit = () => {
    if (!name) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('clients.clientNameIsRequired') });
      return;
    }
    onUpdateClient(client.id, { name, phoneNumber, location });
  };

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
            <DialogClose asChild>
              <Button type="button" variant="secondary">{t('clients.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('clients.saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  );
}
