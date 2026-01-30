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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Seller } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface EditSellerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seller: Seller;
  onUpdateSeller: (sellerId: string, sellerData: Partial<Seller>) => void;
}

export default function EditSellerDialog({ open, onOpenChange, seller, onUpdateSeller }: EditSellerDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  useEffect(() => {
    if (seller) {
      setName(seller.name);
      setContact(seller.contact || '');
      setStatus(seller.status);
    }
  }, [seller]);

  const handleSubmit = () => {
    if (!name) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: "Seller name is required." });
      return;
    }
    onUpdateSeller(seller.id!, { name, contact, status });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sellers.edit')} {t('sellers.seller')}</DialogTitle>
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
          <Button type="button" onClick={handleSubmit}>{t('clients.saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
