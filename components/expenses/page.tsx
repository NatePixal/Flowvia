
'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { collection, query, addDoc, serverTimestamp, Timestamp, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { DailyExpense, Seller, Employee } from '@/lib/types';
import AddExpenseDialog from '@/components/expenses/add-expense-dialog';
import EditExpenseDialog from '@/components/expenses/edit-expense-dialog';
import DeleteExpenseDialog from '@/components/expenses/delete-expense-dialog';
import { useToast } from '@/hooks/use-toast';
import { useCurrency, exchangeRates } from '@/lib/currency-provider';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';
import ExpenseAnalytics from '@/components/expenses/expense-analytics';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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

  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const { data: sellers } = useCompanyCollection<Seller>('sellers');
  const { data: employees } = useCompanyCollection<Employee>('employees');

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
  
  const handleAddExpense = async (expenseData: Omit<DailyExpense, 'id' | 'createdAt' | 'createdBy' | 'companyId'>) => {
    if (!firestore || !user || !userProfile?.companyId) return;

    if (expenseData.expenseType === 'others' && !expenseData.description) {
        toast({ variant: 'destructive', title: t('Description Required'), description: t('Description Is Required For Others') });
        return;
    }
    if (expenseData.expenseType === 'salary' && !expenseData.paid_to_seller_id && !expenseData.employee_id) {
        toast({ variant: 'destructive', title: t('Recipient Required'), description: t('Recipient Is Required For Salary') });
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
        toast({ title: t('Expense Recorded'), description: t('Expense Added Successfully') });
        setIsAddDialogOpen(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: t('Error'), description: e.message || t('Could Not Record Expense') });
    }
  };

  const handleUpdateExpense = async (expenseId: string, expenseData: Partial<DailyExpense>) => {
    if (!firestore) return;
    try {
      const expenseRef = doc(firestore, 'dailyExpenses', expenseId);
      const amountInBase = expenseData.amount! / exchangeRates[expenseData.currency!];
      
      await updateDoc(expenseRef, { ...expenseData, amountBase: amountInBase });
      toast({ title: t('Expense Updated'), description: t('Expense Updated Successfully') });
      setIsEditDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('Error'), description: e.message || t('Could Not Update Expense') });
    }
  };

  const handleDeleteExpense = async () => {
    if (!firestore || !selectedExpense?.id) return;
    try {
      await deleteDoc(doc(firestore, 'dailyExpenses', selectedExpense.id));
      toast({ title: t('Expense Deleted'), description: t('Expense Deleted Successfully') });
      setIsDeleteDialogOpen(false);
      setSelectedExpense(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('Error'), description: e.message || t('Could Not Delete Expense') });
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
        return `${t('Salary Paid To')} ${expense.paid_to_seller_name} (${t('Seller')})`;
    }
    if (expense.employee_name) {
        return `${t('Salary Paid To')} ${expense.employee_name} (${t('Employee')})`;
    }
    return expense.description || t('Salary Payment');
  }

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
          <h1 className="text-2xl font-bold">{t('Expenses')}</h1>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('Add Expense')}
          </Button>
        </div>
        
        <ExpenseAnalytics expenses={filteredExpenses} />
        
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
                <CardTitle>{t('Expense Log')}</CardTitle>
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>
          </CardHeader>
          <CardContent>
            {expensesLoading && <p>{t('Loading')}...</p>}
            {!expensesLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Date')}</TableHead>
                    <TableHead>{t('Expense Type')}</TableHead>
                    <TableHead className="w-[40%]">{t('Description')}</TableHead>
                    <TableHead className="text-right">{t('Amount')}</TableHead>
                    <TableHead className="text-center">{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell>{formatDate(expense.date)}</TableCell>
                      <TableCell>{t(expense.expenseType.toLowerCase())}</TableCell>
                      <TableCell className="truncate max-w-sm">
                        {getSalaryDescription(expense)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatWithCurrency(expense.amount, expense.currency)}</TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('Open Menu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(expense)}>
                                {t('Edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteDialog(expense)} className="text-destructive">
                                {t('Delete')}
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
