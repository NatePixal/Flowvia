'use client';

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Code39Barcode } from './code39';
import type { Product } from '@/lib/types';
import { useTranslation } from 'react-i18next';

export default function ProductBarcodeDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}) {
  const { t } = useTranslation();

  const value = (product?.barcode || product?.productCode || '').toUpperCase();

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('barcode.printTitle')}</DialogTitle>
          <DialogDescription>
            {product ? `${product.name} (${product.productCode})` : t('barcode.noProduct')}
          </DialogDescription>
        </DialogHeader>

        {product && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-md border bg-white p-4">
              <Code39Barcode value={value} />
            </div>
            <div className="text-xs text-muted-foreground">{t('barcode.printHint')}</div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('misc.close')}
          </Button>
          <Button onClick={handlePrint} disabled={!product}>
            {t('barcode.print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
