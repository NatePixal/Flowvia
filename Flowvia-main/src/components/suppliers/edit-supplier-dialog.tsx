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
import { Supplier } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface EditSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier;
  onUpdateSupplier: (supplierId: string, supplierData: Partial<Supplier>) => void;
}

export default function EditSupplierDialog({ open, onOpenChange, supplier, onUpdateSupplier }: EditSupplierDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [factoryName, setFactoryName] = useState('');

  useEffect(() => {
    if (supplier) {
      setName(supplier.name);
      setEmail((supplier as any).email || '');
      setPhone((supplier as any).phone || '');
      setFactoryName((supplier as any).factoryName || '');
    }
  }, [supplier]);

  const handleSubmit = () => {
    if (!name) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('suppliers.supplierNameIsRequired') });
      return;
    }
    onUpdateSupplier(supplier.id!, { name, email, phone, factoryName } as Partial<Supplier>);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('suppliers.editSupplier')}</DialogTitle>
            <DialogDescription>{t('suppliers.editTheDetailsForThisSupplier')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('suppliers.supplierName')} <span className="text-destructive">*</span></Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
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
            <Button type="button" onClick={handleSubmit}>{t('suppliers.saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
