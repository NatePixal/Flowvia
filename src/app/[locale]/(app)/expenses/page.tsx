
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, MoreHorizontal, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { addDoc, serverTimestamp, Timestamp, doc, updateDoc, deleteDoc, FieldValue } from 'firebase/firestore';
import type { DailyExpense, Seller, Employee, Currency, FxSnapshot, UserProfile } from '@/lib/types';
import AddExpenseDialog from '@/components/expenses/add-expense-dialog';
import EditExpenseDialog from '@/components/expenses/edit-expense-dialog';
import DeleteExpenseDialog from '@/components/expenses/delete-expense-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrency, exchangeRates } from '@/lib/currency-provider';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import ExpenseAnalytics from '@/components/expenses/expense-analytics';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { formatMoneyMinor, toMinor, convertMinorToBase } from '@/lib/money';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { FancyCard } from '@/components/ui/fancy-card';
import { useCompanyUsers } from '@/hooks/use-company-users';

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


export default function ExpensesPage() {
  const { t } = useTranslation();
  const { firestore, user, companyId, companyBaseCurrency } = useFirebase();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<DailyExpense | null>(null);

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  const { data: employees } = useCompanyCollection<Employee>('employees');
  const { users: companyUsers } = useCompanyUsers();

  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(expense => {
      if (!dateRange?.from) return true;
      const expenseDate = safeGetDate(expense.date);
      if (!expenseDate) return false;
      
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return expenseDate >= from && expenseDate <= toEndOfDay;
    });
  }, [expenses, dateRange]);
  
  const handleAddExpense = async (expenseData: any) => {
    if (!companyId || !companyBaseCurrency) {
        toast({ variant: 'destructive', title: t('error'), description: t('companyIdMissingError') });
        return;
    }
    
    const { expenseType, description, amount, currency, date, paid_to_seller_id, employee_id, fx } = expenseData;

    if (expenseType === 'others' && !description) {
        toast({ variant: 'destructive', title: t('descriptionRequired'), description: t('descriptionIsRequiredForOthers') });
        return;
    }
    if (expenseType === 'salary' && !paid_to_seller_id && !employee_id) {
        toast({ variant: 'destructive', title: t('recipientRequired'), description: t('recipientIsRequiredForSalary') });
        return;
    }
    
    try {
        let recipientName = '';
        if (paid_to_seller_id) {
            recipientName = sellers?.find(s => s.id === paid_to_seller_id)?.name || '';
        } else if (employee_id) {
             recipientName = employees?.find(e => e.id === employee_id)?.employee_name || '';
        }
        
        const expensesCollectionRef = companyCollection(firestore, companyId, 'dailyExpenses');
        
        const payload: Omit<DailyExpense, 'id'> = {
          ...withCompanyId(companyId, {}),
          expenseType,
          description,
          amount,
          currency,
          date: Timestamp.fromDate(date),
          paid_to_seller_id: paid_to_seller_id || '',
          employee_id: employee_id || '',
          paid_to_seller_name: paid_to_seller_id ? recipientName : '',
          employee_name: employee_id ? recipientName : '',
          amountMinor: toMinor(amount, currency),
          baseCurrency: companyBaseCurrency,
          createdAt: serverTimestamp(),
          createdBy: user?.uid,
        };

        if (currency !== companyBaseCurrency) {
          if (!fx) throw new Error("FX data is required for cross-currency transaction.");
          payload.fx = fx;
          if (payload.amountMinor) {
            payload.amountBaseMinor = convertMinorToBase(payload.amountMinor, fx.rateToBase, currency, companyBaseCurrency);
          }
        } else {
          payload.amountBaseMinor = payload.amountMinor;
        }

        await addDoc(expensesCollectionRef, payload);

        toast({ title: t('expenseRecorded'), description: t('expenseAddedSuccessfully') });
        setIsAddDialogOpen(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotRecordExpense') });
    }
  };

  const handleUpdateExpense = async (expenseId: string, expenseData: Partial<DailyExpense>) => {
    if (!firestore || !companyId || !companyBaseCurrency) return;
    try {
      const expenseRef = companyDoc(firestore, companyId, `dailyExpenses/${expenseId}`);
      
      const payload: Partial<DailyExpense> = { ...expenseData };
      if (expenseData.amount && expenseData.currency) {
        payload.amountMinor = toMinor(expenseData.amount, expenseData.currency);
        if (expenseData.currency === companyBaseCurrency) {
          payload.amountBaseMinor = payload.amountMinor;
          payload.fx = undefined;
        } else if (expenseData.fx) {
          if (payload.amountMinor) {
            payload.amountBaseMinor = convertMinorToBase(payload.amountMinor, expenseData.fx.rateToBase, expenseData.currency, companyBaseCurrency);
          }
        }
      }
      
      await updateDoc(expenseRef, payload);
      toast({ title: t('expenseUpdated'), description: t('expenseUpdatedSuccessfully') });
      setIsEditDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateExpense') });
    }
  };

  const handleDeleteExpense = async () => {
    if (!firestore || !selectedExpense?.id || !companyId) return;
    try {
      await deleteDoc(companyDoc(firestore, companyId, `dailyExpenses/${selectedExpense.id}`));
      toast({ title: t('toast.success.expenseDeleted'), description: t('toast.success.expenseDeletedSuccessfully') });
      setIsDeleteDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message || t('toast.error.couldNotDeleteExpense') });
    }
  };
  
  const formatDate = (date: DateInput) => {
    const d = safeGetDate(date);
    return d ? format(d, 'yyyy-MM-dd') : 'N/A';
  }

  const getSalaryDescription = (expense: DailyExpense) => {
    if (expense.expenseType !== 'salary') return expense.description;
    
    if (expense.paid_to_seller_name) {
        return `${t('expenses.salaryPaidTo')} ${expense.paid_to_seller_name} (${t('employees.seller')})`;
    }
    if (expense.employee_name) {
        return `${t('expenses.salaryPaidTo')} ${expense.employee_name} (${t('employees.employee')})`;
    }
    return expense.description || t('expenses.salaryPayment');
  }

  const openEditDialog = (expense: DailyExpense) => {
    setSelectedExpense(expense);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (expense: DailyExpense) => {
    setSelectedExpense(expense);
    setIsDeleteDialogOpen(true);
  };
  
  const handleExport = () => {
    const usersById = new Map(companyUsers.map((u) => [u.id, u]));
    exportToXlsx(
      `expenses_${companyId}_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      t('expenses.pageTitle'),
      filteredExpenses,
      [
        { header: "ID", value: r => r.id },
        { header: t('expenses.date'), value: r => {
          const dt = safeGetDate(r.date);
          return dt ? format(dt, "yyyy-MM-dd HH:mm:ss") : "";
        }},
        { header: t('expenses.category'), value: r => r.expenseType ?? "" },
        { header: t('expenses.amount'), value: r => r.amount ?? "" },
        { header: t('expenses.currency'), value: r => r.currency ?? "" },
        { header: t('expenses.amountBaseMinor'), value: r => r.amountBaseMinor ?? "" },
        { header: t('expenses.description'), value: r => getSalaryDescription(r) ?? "" },
        { header: "Created By", value: r => usersById.get(r.createdBy!)?.name ?? r.createdBy ?? "" },
      ]
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">{t('expenses.pageTitle')}</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('expenses.addExpense')}
          </Button>
        </div>
        
        <ExpenseAnalytics expenses={filteredExpenses} />
        
        <FancyCard>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>{t('expenses.expenseLog')}</CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredExpenses.length === 0}>
                        <FileDown className="mr-2 h-4 w-4" />
                        {t('expenses.export')}
                    </Button>
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {expensesLoading && <p>{t('misc.loading')}...</p>}
            {!expensesLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('expenses.date')}</TableHead>
                    <TableHead>{t('expenses.expenseType')}</TableHead>
                    <TableHead className="w-[40%]">{t('expenses.description')}</TableHead>
                    <TableHead className="text-right">{t('expenses.amount')}</TableHead>
                    <TableHead className="text-center">{t('expenses.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell>{t(`expenses.${expense.expenseType.toLowerCase()}`)}</TableCell>
                      <TableCell className="truncate max-w-sm">
                        {getSalaryDescription(expense)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoneyMinor(expense.amountMinor ?? 0, expense.currency)}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('expenses.openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(expense)}>
                                {t('expenses.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteDialog(expense)} className="text-destructive">
                                {t('expenses.delete')}
                            </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </FancyCard>
      </div>
      <AddExpenseDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddExpense={handleAddExpense}
        sellers={sellers || []}
        employees={employees || []}
      />
      {selectedExpense && (
        <EditExpenseDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            expense={selectedExpense}
            onUpdateExpense={handleUpdateExpense}
            sellers={sellers || []}
            employees={employees || []}
        />
      )}
      {selectedExpense && (
        <DeleteExpenseDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirm={handleDeleteExpense}
        />
      )}
    </>
  );
}
