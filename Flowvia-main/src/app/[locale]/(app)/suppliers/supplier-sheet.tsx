
'use client';

import { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Supplier, SupplierLedgerEntry } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { collection, query, where, orderBy, Timestamp, QueryConstraint, FieldValue } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency-provider';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { formatMoneyMinor } from '@/lib/money';

interface SupplierSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

type DateInput = string | Date | Timestamp | FieldValue | null | undefined;

const safeGetDate = (value: DateInput): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Ignore FieldValue sentinels (serverTimestamp) and any unexpected shapes safely
  if (typeof value === 'object' && value && typeof (value as any).toDate === 'function') {
    try {
      const d = (value as any).toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
};


export default function SupplierSheet({ open, onOpenChange, supplier }: SupplierSheetProps) {
  const { t } = useTranslation();
  const { userProfile } = useFirebase();
  const { currency: displayCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const supplierId = supplier?.id;

  const ledgerConstraints: QueryConstraint[] = useMemo(() => {
    if (!supplierId) return [];
    return [
      orderBy('createdAt', 'desc')
    ];
  }, [supplierId]);
  
  const { data: ledgerEntries, loading: ledgerLoading } = useCompanyCollection<SupplierLedgerEntry>(`suppliers/${supplierId}/ledger`, ...ledgerConstraints);


  const filteredLedger = useMemo(() => {
    return (ledgerEntries || []).filter(entry => {
      if (!dateRange?.from) return true;
      const entryDate = safeGetDate(entry.createdAt);
      if (!entryDate) return false;
      
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return entryDate >= from && entryDate <= toEndOfDay;
    });
  }, [ledgerEntries, dateRange]);


  const { totalBalance, lastPaymentDate } = useMemo(() => {
    if (!supplier?.balanceDueByCurrency) return { totalBalance: 0, lastPaymentDate: null };
    
    // This just shows the summary in the display currency. It does not convert.
    const total = supplier.balanceDueByCurrency[displayCurrency] || 0;

    const lastPayment = ledgerEntries?.find(e => e.type === 'payment');

    return {
        totalBalance: total,
        lastPaymentDate: lastPayment ? safeGetDate(lastPayment.createdAt) : null,
    };
  }, [supplier, ledgerEntries, displayCurrency]);

  const formatDate = (date: DateInput) => {
    if (!date) return 'N/A';
    const d = safeGetDate(date);
    return d ? format(d, 'yyyy-MM-dd HH:mm') : 'N/A';
  }
  
  if (!supplier) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('suppliers.paymentHistory')}: {supplier.name}</SheetTitle>
          <SheetDescription>
            {t('suppliers.completePaymentLedgerForThisSupplier')}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 flex-1 overflow-y-auto p-1">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t('suppliers.salarySummary')}</h3>
            <div className="mt-2 space-y-2 text-sm">
               <div className="flex justify-between">
                <span>{t('suppliers.totalBalanceDue')} ({displayCurrency}):</span>
                <span className="font-semibold text-lg">{formatMoneyMinor(totalBalance, displayCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('suppliers.lastPaymentDate')}:</span>
                <span className="font-medium">{lastPaymentDate ? format(lastPaymentDate, 'PPP') : t('suppliers.never')}</span>
              </div>
            </div>
          </div>
          <Separator />
           <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('suppliers.transactionLedger')}</h3>
            </div>
             <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                className="rounded-md border"
             />
            <div className="mt-2 text-sm">
              {ledgerLoading ? (
                <p>{t('suppliers.loading')}...</p>
              ) : filteredLedger && filteredLedger.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('suppliers.date')}</TableHead>
                      <TableHead>{t('suppliers.type')}</TableHead>
                      <TableHead className="text-right">{t('suppliers.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLedger.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDate(tx.createdAt)}</TableCell>
                        <TableCell className="capitalize">{t(tx.type)}</TableCell>
                        <TableCell className="text-right font-medium">
                          {tx.type === 'payment' ? '-' : '+'} {formatMoneyMinor(tx.paymentMinor || tx.purchaseTotalMinor || 0, tx.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">{t('suppliers.noTransactionsFound')}</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
