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
import { useTranslation } from 'react-i18next';

interface DeleteSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeleteSupplierDialog({ open, onOpenChange, onConfirm }: DeleteSupplierDialogProps) {
  const { t, ready } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('suppliers.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('suppliers.thisActionCannotBeUndoneThisWillPermanentlyDeleteTheSupplier')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('suppliers.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('suppliers.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
