
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

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSupplier: (name: string) => void;
}

export default function AddSupplierDialog({ open, onOpenChange, onAddSupplier }: AddSupplierDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [supplierName, setSupplierName] = useState('');

  const handleSubmit = () => {
    if (!supplierName.trim()) {
      toast({
        variant: 'destructive',
        title: t('missingField'),
        description: t('pleaseEnterASupplierName'),
      });
      return;
    }
    onAddSupplier(supplierName);
    setSupplierName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('registerNewSupplier')}</DialogTitle>
          <DialogDescription>{t("addANewSupplierToYourList")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="supplierName">{t('supplierName')} <span className="text-destructive">*</span></Label>
            <Input id="supplierName" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">{t('cancel')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>{t('addSupplier')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
