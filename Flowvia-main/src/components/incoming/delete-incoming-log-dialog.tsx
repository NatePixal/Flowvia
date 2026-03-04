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

interface DeleteIncomingLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeleteIncomingLogDialog({ open, onOpenChange, onConfirm }: DeleteIncomingLogDialogProps) {
  const { t, ready } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('incoming.areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('incoming.thisActionCannotBeUndoneAndWillRevertTheStockChanges')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('incoming.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('incoming.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
