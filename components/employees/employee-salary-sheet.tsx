
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
import { Employee, DailyExpense } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency-provider';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { useCollection, useMemoFirebase } from '@/firebase';

interface EmployeeSalarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

const safeGetDate = (date: string | Timestamp | Date | undefined): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (date instanceof Timestamp) return date.toDate();
  const parsedDate = new Date(date);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
};


export default function EmployeeSalarySheet({ open, onOpenChange, employee }: EmployeeSalarySheetProps) {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { formatCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const employeeId = employee?.id;

  const salaryQuery = useMemoFirebase(
    () =>
      firestore && employeeId
        ? query(
            collection(firestore, 'dailyExpenses'), 
            where('employee_id', '==', employeeId)
          )
        : null,
    [firestore, employeeId]
  );
  const { data: salaryExpensesCollection, isLoading: salaryLoading } = useCollection<DailyExpense>(salaryQuery);
  
  const sortedExpenses = useMemo(() => {
    if (!salaryExpensesCollection) return [];
    // Filter for salary and company on the client
    const clientFiltered = salaryExpensesCollection.filter(exp => 
        exp.companyId === userProfile?.companyId && exp.expenseType === 'salary'
    );
    // Then sort
    return [...clientFiltered].sort((a, b) => {
      const dateA = safeGetDate(a.date)?.getTime() || 0;
      const dateB = safeGetDate(b.date)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [salaryExpensesCollection, userProfile?.companyId]);


  const filteredSalaries = useMemo(() => {
    return (sortedExpenses || []).filter(expense => {
      if (!dateRange?.from) return true;
      const expenseDate = safeGetDate(expense.date);
      if (!expenseDate) return false;
      
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return expenseDate >= from && expenseDate <= toEndOfDay;
    });
  }, [sortedExpenses, dateRange]);


  const { totalSalaryPaid, lastPaymentDate } = useMemo(() => {
    let total = 0;
    let lastDate : Date | null = null;
    
    filteredSalaries.forEach(exp => {
        total += exp.amountBase || 0;
        const expDate = safeGetDate(exp.date);
        if(expDate && (!lastDate || expDate > lastDate)) {
            lastDate = expDate;
        }
    });

    return {
        totalSalaryPaid: total,
        lastPaymentDate: lastDate,
    };
  }, [filteredSalaries]);

  const formatDate = (date: Timestamp | string | Date | undefined | null) => {
    if (!date) return 'N/A';
    const d = safeGetDate(date);
    return d ? format(d, 'yyyy-MM-dd HH:mm') : 'N/A';
  }
  
  const formatWithCurrency = (price: number, priceCurrency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: priceCurrency,
    }).format(price);
  }

  if (!employee) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('Salary History')}: {employee.employee_name}</SheetTitle>
          <SheetDescription>
            {t('Complete Salary Ledger For This Employee')}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 flex-1 overflow-y-auto p-1">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t('Salary Summary')}</h3>
            <div className="mt-2 space-y-2 text-sm">
               <div className="flex justify-between">
                <span>{t('Total Salary Paid')}:</span>
                <span className="font-semibold text-lg">{formatCurrency(totalSalaryPaid)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('Last Payment Date')}:</span>
                <span className="font-medium">{lastPaymentDate ? format(lastPaymentDate, 'PPP') : t('Never')}</span>
              </div>
            </div>
          </div>
          <Separator />
           <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('Payment Ledger')}</h3>
            </div>
             <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                className="rounded-md border"
             />
            <div className="mt-2 text-sm">
              {salaryLoading ? (
                <p>{t('Loading')}...</p>
              ) : filteredSalaries && filteredSalaries.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead className="text-right">{t('Amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSalaries.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-right font-medium">
                            {formatWithCurrency(tx.amount, tx.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">{t('No Salary Payments Found')}</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
