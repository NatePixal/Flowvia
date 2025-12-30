
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
import { Supplier, IncomingProductLog } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface EditIncomingLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditLog: (logId: string, data: { quantity: number; unitCost: number; supplier: string; }) => void;
  log: IncomingProductLog;
  suppliers: Supplier[];
}

export default function EditIncomingLogDialog({
  open,
  onOpenChange,
  onEditLog,
  log,
  suppliers,
}: EditIncomingLogDialogProps) {
  const { t } = useTranslation();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState('');
  
  useEffect(() => {
    if (log) {
        setQuantity(String(log.quantity));
        setUnitCost(String(log.unitCost));
        setSupplier(log.supplier || '');
    }
  }, [log]);


  const handleSubmit = () => {
    if (!log) return;
    const updatedData = {
      quantity: parseInt(quantity, 10) || 0,
      unitCost: parseFloat(unitCost) || 0,
      supplier,
    };
    onEditLog(log.id, updatedData);
  };

  if (!log) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Edit Incoming Log')}</DialogTitle>
          <DialogDescription>
            {t('Edit The Log For Product {productCode}', { productCode: log.productCode })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 space-y-2">
                <Label htmlFor="productCode">{t('Product Code')}</Label>
                <Input id="productCode" value={log.productCode} disabled />
            </div>
            <div className="space-y-2">
                <Label htmlFor="quantity">{t('Quantity Received')} <span className="text-destructive">*</span></Label>
                <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="cost">{t('Unit Cost')}</Label>
                <Input id="cost" type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-2">
                <Label htmlFor="supplier">{t('Supplier')}</Label>
                <Select onValueChange={setSupplier} value={supplier}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('Select Supplier')} />
                    </SelectTrigger>
                    <SelectContent>
                        {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {t('Cancel')}
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>
            {t('Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
