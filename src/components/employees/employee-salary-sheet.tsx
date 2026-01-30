
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
import { collection, query, where, orderBy, Timestamp, QueryConstraint, FieldValue } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency-provider';
import { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { formatMoneyMinor, toMinor } from '@/lib/money';

interface EmployeeSalarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
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


export default function EmployeeSalarySheet({ open, onOpenChange, employee }: EmployeeSalarySheetProps) {
  const { t } = useTranslation();
  const { userProfile } = useFirebase();
  const { baseCurrency } = useCurrency();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const employeeId = employee?.id;

  const salaryConstraints = useMemo(() => {
    if (!employeeId) return [];
    return [
      where('employee_id', '==', employeeId),
      where('expenseType', '==', 'salary'),
      orderBy('date', 'desc')
    ];
  }, [employeeId]);
  
  const { data: salaryExpensesCollection, loading: salaryLoading } = useCompanyCollection<DailyExpense>('dailyExpenses', ...salaryConstraints);


  const filteredSalaries = useMemo(() => {
    return (salaryExpensesCollection || []).filter(expense => {
      if (!dateRange?.from) return true;
      const expenseDate = safeGetDate(expense.date);
      if (!expenseDate) return false;
      
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return expenseDate >= from && expenseDate <= toEndOfDay;
    });
  }, [salaryExpensesCollection, dateRange]);


  const { totalSalaryPaid, lastPaymentDate } = useMemo(() => {
    let total = 0;
    let lastDate : Date | null = null;
    
    filteredSalaries.forEach(exp => {
        total += exp.amountBaseMinor || 0;
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

  const formatDate = (date: DateInput) => {
    if (!date) return 'N/A';
    const d = safeGetDate(date);
    return d ? format(d, 'yyyy-MM-dd HH:mm') : 'N/A';
  }
  
  if (!employee) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('employees.salaryHistory')}: {employee.employee_name}</SheetTitle>
          <SheetDescription>
            {t('employees.completeSalaryLedgerForThisEmployee')}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4 flex-1 overflow-y-auto p-1">
          <div>
            <h3 className="text-sm font-medium text-muted-foreground">{t('employees.salarySummary')}</h3>
            <div className="mt-2 space-y-2 text-sm">
               <div className="flex justify-between">
                <span>{t('employees.totalSalaryPaid')}:</span>
                <span className="font-semibold text-lg">{formatMoneyMinor(totalSalaryPaid, baseCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>{t('employees.lastPaymentDate')}:</span>
                <span className="font-medium">{lastPaymentDate ? format(lastPaymentDate, 'PPP') : t('employees.never')}</span>
              </div>
            </div>
          </div>
          <Separator />
           <div>
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('employees.paymentLedger')}</h3>
            </div>
             <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                className="rounded-md border"
             />
            <div className="mt-2 text-sm">
              {salaryLoading ? (
                <p>{t('employees.loading')}...</p>
              ) : filteredSalaries && filteredSalaries.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('employees.date')}</TableHead>
                      <TableHead className="text-right">{t('employees.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSalaries.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell className="text-right font-medium">
                            {formatMoneyMinor(toMinor(tx.amount, tx.currency), tx.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground">{t('employees.noSalaryPaymentsFound')}</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
