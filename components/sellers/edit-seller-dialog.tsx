
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
      toast({ variant: 'destructive', title: t('Missing Fields'), description: t('Seller Name Is Required') });
      return;
    }
    onUpdateSeller(seller.id!, { name, contact, status });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Edit Seller')}</DialogTitle>
          <DialogDescription>{t('Edit the details for this seller.')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('Seller Name')} <span className="text-destructive">*</span></Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact">{t('Contact Details')}</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder={t('Optional')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t('Status')}</Label>
            <Select onValueChange={(value: 'active' | 'inactive') => setStatus(value)} value={status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('Active')}</SelectItem>
                <SelectItem value="inactive">{t('Inactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">{t('Cancel')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>{t('Save Changes')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
