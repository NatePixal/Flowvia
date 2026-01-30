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
import { Seller } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface AddSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSeller: (seller: Omit<Seller, 'id' | 'createdAt' | 'companyId'>) => void;
}

export default function AddSellerDialog({ open, onOpenChange, onAddSeller }: AddSellerDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const handleSubmit = () => {
    if (!name) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: "Seller name is required." });
      return;
    }
    onAddSeller({ name, contact, status });
    setName('');
    setContact('');
    setStatus('active');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sellers.addSeller')}</DialogTitle>
          <DialogDescription>{t('sellers.pageDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('sellers.seller')} <span className="text-destructive">*</span></Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">{t('sellers.contactDetails')}</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('misc.optional')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t('sellers.status')}</Label>
            <Select onValueChange={(value: 'active' | 'inactive') => setStatus(value)} value={status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('status.active')}</SelectItem>
                <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">{t('clients.cancel')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>{t('sellers.addSeller')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    