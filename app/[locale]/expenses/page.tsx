
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, MoreHorizontal, FileDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, addDoc, serverTimestamp, Timestamp, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { DailyExpense, Seller, Employee } from '@/lib/types';
import AddExpenseDialog from '@/components/expenses/add-expense-dialog';
import EditExpenseDialog from '@/components/expenses/edit-expense-dialog';
import DeleteExpenseDialog from '@/components/expenses/delete-expense-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrency, exchangeRates } from '@/lib/currency-provider';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportToCSV } from '@/lib/csv-export';

const safeGetDate = (date: string | Timestamp | Date | undefined): Date | null => {
  if (!date) return null;
  if (date instanceof Date) return date;
  if (date instanceof Timestamp) return date.toDate();
  const parsedDate = new Date(date);
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
};


export default function ExpensesPage() {
  const { t } = useTranslation();
  const { firestore, user, userProfile } = useFirebase();
  const { toast } = useToast();
  const { formatCurrency } = useCurrency();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<DailyExpense | null>(null);

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const { data: expenses, isLoading: expensesLoading } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  const { data: employees } = useCompanyCollection<Employee>('employees');

  const filteredExpenses = useMemo(() => {
    const allExpenses = (expenses || []);
    
    // Sort by creation date descending first
    allExpenses.sort((a, b) => {
        const dateA = a.createdAt ? a.createdAt.toMillis() : 0;
        const dateB = b.createdAt ? b.createdAt.toMillis() : 0;
        return dateB - dateA;
    });

    // Then filter by date range
    return allExpenses.filter(expense => {
      if (!dateRange?.from) return true;
      const expenseDate = safeGetDate(expense.date);
      if (!expenseDate) return false;
      
      const from = dateRange.from;
      const to = dateRange.to || from;
      const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
      return expenseDate >= from && expenseDate <= toEndOfDay;
    });
  }, [expenses, dateRange]);
  
  const handleAddExpense = async (expenseData: Omit<DailyExpense, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!firestore || !user || !userProfile?.companyId) return;

    if (expenseData.expenseType === 'others' && !expenseData.description) {
        toast({ variant: 'destructive', title: t('descriptionRequired'), description: t('descriptionIsRequiredForOthers') });
        return;
    }
    if (expenseData.expenseType === 'salary' && !expenseData.paid_to_seller_id && !expenseData.employee_id) {
        toast({ variant: 'destructive', title: t('recipientRequired'), description: t('recipientIsRequiredForSalary') });
        return;
    }
    
    try {
        const amountInBase = expenseData.amount / exchangeRates[expenseData.currency];
        
        let recipientName = '';
        if (expenseData.paid_to_seller_id) {
            const seller = (sellers || []).find(s => s.id === expenseData.paid_to_seller_id);
            recipientName = seller ? seller.name : '';
        } else if (expenseData.employee_id) {
             const employee = (employees || []).find(e => e.id === expenseData.employee_id);
            recipientName = employee ? employee.employee_name : '';
        }

        await addDoc(collection(firestore, 'dailyExpenses'), {
            ...expenseData,
            companyId: userProfile.companyId,
            paid_to_seller_name: expenseData.paid_to_seller_id ? recipientName : '',
            employee_name: expenseData.employee_id ? recipientName : '',
            amountBase: amountInBase,
            date: expenseData.date ? Timestamp.fromDate(new Date(expenseData.date as string)) : serverTimestamp(),
            createdAt: serverTimestamp(),
            createdBy: user.uid,
        });
        toast({ title: t('expenseRecorded'), description: t('expenseAddedSuccessfully') });
        setIsAddDialogOpen(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotRecordExpense') });
    }
  };

  const handleUpdateExpense = async (expenseId: string, expenseData: Partial<DailyExpense>) => {
    if (!firestore) return;
    try {
      const expenseRef = doc(firestore, 'dailyExpenses', expenseId);
      const amountInBase = expenseData.amount! / exchangeRates[expenseData.currency!];
      
      await updateDoc(expenseRef, { ...expenseData, amountBase: amountInBase });
      toast({ title: t('expenseUpdated'), description: t('expenseUpdatedSuccessfully') });
      setIsEditDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateExpense') });
    }
  };

  const handleDeleteExpense = async () => {
    if (!firestore || !selectedExpense?.id) return;
    try {
      await deleteDoc(doc(firestore, 'dailyExpenses', selectedExpense.id));
      toast({ title: t('expenseDeleted'), description: t('expenseDeletedSuccessfully') });
      setIsDeleteDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotDeleteExpense') });
    }
  };
  
  const formatDate = (date: string | Timestamp | Date) => {
    const d = safeGetDate(date);
    return d ? format(d, 'yyyy-MM-dd') : 'N/A';
  }

  const formatWithCurrency = (price: number, priceCurrency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: priceCurrency,
    }).format(price);
  }

  const getSalaryDescription = (expense: DailyExpense) => {
    if (expense.expenseType !== 'salary') return expense.description;
    
    if (expense.paid_to_seller_name) {
        return `${t('salaryPaidTo')} ${expense.paid_to_seller_name} (${t('seller')})`;
    }
    if (expense.employee_name) {
        return `${t('salaryPaidTo')} ${expense.employee_name} (${t('employee')})`;
    }
    return expense.description || t('salaryPayment');
  }

  const handleExport = () => {
    if (filteredExpenses.length > 0) {
      const dataToExport = filteredExpenses.map(e => ({
        [t('date')]: formatDate(e.date),
        [t('expenseType')]: t(e.expenseType),
        [t('description')]: getSalaryDescription(e),
        [t('amount')]: e.amount,
        [t('currency')]: e.currency,
      }));
      exportToCSV(dataToExport, 'expenses.csv');
    } else {
      toast({
        variant: 'destructive',
        title: t('exportFailed'),
        description: t('noDataToExport'),
      });
    }
  };

  const openEditDialog = (expense: DailyExpense) => {
    setSelectedExpense(expense);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (expense: DailyExpense) => {
    setSelectedExpense(expense);
    setIsDeleteDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('expenses')}</h1>
          <div className="flex items-center gap-2">
             <Button variant="outline" onClick={handleExport}>
                <FileDown className="mr-2 h-4 w-4" />
                {t('export')}
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('addExpense')}
            </Button>
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle>{t('expenseLog')}</CardTitle>
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>
          </CardHeader>
          <CardContent>
            {expensesLoading && <p>{t('loading')}...</p>}
            {!expensesLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('expenseType')}</TableHead>
                    <TableHead className="w-[40%]">{t('description')}</TableHead>
                    <TableHead className="text-right">{t('amount')}</TableHead>
                    <TableHead className="text-center">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell>{t(expense.expenseType)}</TableCell>
                      <TableCell className="truncate max-w-sm">
                        {getSalaryDescription(expense)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatWithCurrency(expense.amount, expense.currency)}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(expense)}>
                                {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteDialog(expense)} className="text-destructive">
                                {t('delete')}
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
        </Card>
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
