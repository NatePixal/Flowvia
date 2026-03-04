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
import { Supplier } from '@/lib/types';

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'companyId'>) => void;
}

export default function AddSupplierDialog({ open, onOpenChange, onAddSupplier }: AddSupplierDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [factoryName, setFactoryName] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: t('toast.error.missingFields'),
        description: t('suppliers.pleaseEnterASupplierName'),
      });
      return;
    }
    onAddSupplier({ name, email, phone, factoryName } as Omit<Supplier, 'id' | 'companyId'>);
    setName('');
    setEmail('');
    setPhone('');
    setFactoryName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('suppliers.registerNewSupplier')}</DialogTitle>
            <DialogDescription>{t('suppliers.addANewSupplierToYourList')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="supplierName">{t('suppliers.supplierName')} <span className="text-destructive">*</span></Label>
              <Input id="supplierName" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="factoryName">Factory Name</Label>
              <Input id="factoryName" value={factoryName} onChange={(e) => setFactoryName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('suppliers.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('suppliers.phone')}</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">{t('suppliers.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('suppliers.addSupplier')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
