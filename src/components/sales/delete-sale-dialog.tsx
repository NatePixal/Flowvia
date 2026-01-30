
'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Sale } from '@/lib/types';
import { useTranslation } from 'react-i18next';

interface DeleteSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeleteSaleDialog({ open, onOpenChange, onConfirm }: DeleteSaleDialogProps) {
  const { t, ready } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sales.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('sales.deleteSaleWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('sales.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('sales.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
