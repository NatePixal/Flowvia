
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DailyExpense, Currency, Seller, Employee } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Timestamp } from 'firebase/firestore';


interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: DailyExpense;
  onUpdateExpense: (expenseId: string, expenseData: Partial<DailyExpense>) => void;
  sellers: Seller[];
  employees: Employee[];
}

export default function EditExpenseDialog({ open, onOpenChange, expense, onUpdateExpense, sellers, employees }: EditExpenseDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [expenseType, setExpenseType] = useState<DailyExpense['expenseType'] | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency | ''>('');
  const [date, setDate] = useState<Date | undefined>();
  
  const [salaryRecipientType, setSalaryRecipientType] = useState<'seller' | 'employee' | ''>('');
  const [sellerId, setSellerId] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    if (expense) {
        setExpenseType(expense.expenseType);
        setDescription(expense.description);
        setAmount(String(expense.amount));
        setCurrency(expense.currency);
        
        const expenseDate = expense.date instanceof Timestamp ? expense.date.toDate() : new Date(expense.date);
        setDate(expenseDate);
        
        if (expense.expenseType === 'salary') {
            if(expense.paid_to_seller_id) {
                setSalaryRecipientType('seller');
                setSellerId(expense.paid_to_seller_id);
            } else if (expense.employee_id) {
                setSalaryRecipientType('employee');
                setEmployeeId(expense.employee_id);
            }
        }
    }
  }, [expense]);
  
  const handleSubmit = () => {
    if (!expenseType || !amount || !currency || !date) {
      toast({ variant: 'destructive', title: t('missingFields'), description: t('pleaseFillAllRequiredFields') });
      return;
    }
    if (expenseType === 'others' && !description) {
        toast({ variant: 'destructive', title: t('descriptionRequired'), description: t('descriptionIsRequiredForOthers') });
        return;
    }
     if (expenseType === 'salary' && salaryRecipientType === 'seller' && !sellerId) {
        toast({ variant: 'destructive', title: t('sellerRequired'), description: t('sellerIsRequiredForSalary') });
        return;
    }
    if (expenseType === 'salary' && salaryRecipientType === 'employee' && !employeeId) {
        toast({ variant: 'destructive', title: t('employeeRequired'), description: t('employeeIsRequiredForSalary') });
        return;
    }

    const expenseData: Partial<DailyExpense> = {
      expenseType,
      description,
      amount: parseFloat(amount),
      currency,
      date,
      paid_to_seller_id: salaryRecipientType === 'seller' ? sellerId : '',
      paid_to_seller_name: salaryRecipientType === 'seller' ? sellers.find(s => s.id === sellerId)?.name : '',
      employee_id: salaryRecipientType === 'employee' ? employeeId : '',
      employee_name: salaryRecipientType === 'employee' ? employees.find(e => e.id === employeeId)?.employee_name : '',
    };
    
    onUpdateExpense(expense.id!, expenseData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editExpense')}</DialogTitle>
          <DialogDescription>{t('editTheDetailsOfTheExpense')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="expenseType">{t('expenseType')} <span className="text-destructive">*</span></Label>
            <Select onValueChange={(v) => setExpenseType(v as DailyExpense['expenseType'])} value={expenseType}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectExpenseType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food">{t('food')}</SelectItem>
                <SelectItem value="salary">{t('salary')}</SelectItem>
                <SelectItem value="transport">{t('transport')}</SelectItem>
                <SelectItem value="rent">{t('rent')}</SelectItem>
                <SelectItem value="utilities">{t('utilities')}</SelectItem>
                <SelectItem value="marketing">{t('marketing')}</SelectItem>
                <SelectItem value="others">{t('others')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {expenseType === 'salary' && (
            <div className="space-y-3 rounded-md border p-4">
                <Label>{t('recipient')} <span className="text-destructive">*</span></Label>
                <RadioGroup value={salaryRecipientType} onValueChange={(v) => setSalaryRecipientType(v as 'seller' | 'employee')} className="flex gap-4">
                    <div className="flex items-center space-x-2">
                        <RadioGroupItem value="seller" id="r_seller_edit" />
                        <Label htmlFor="r_seller_edit">{t('seller')}</Label>
                    </div>
                     <div className="flex items-center space-x-2">
                        <RadioGroupItem value="employee" id="r_employee_edit" />
                        <Label htmlFor="r_employee_edit">{t('employee')}</Label>
                    </div>
                </RadioGroup>

                {salaryRecipientType === 'seller' && (
                    <div className="space-y-2 pt-2">
                        <Label htmlFor="seller">{t('paidToSeller')} <span className="text-destructive">*</span></Label>
                        <Select onValueChange={setSellerId} value={sellerId}>
                            <SelectTrigger><SelectValue placeholder={t('selectSeller')} /></SelectTrigger>
                            <SelectContent>
                                {sellers.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                 {salaryRecipientType === 'employee' && (
                    <div className="space-y-2 pt-2">
                        <Label htmlFor="employee">{t('paidToEmployee')} <span className="text-destructive">*</span></Label>
                        <Select onValueChange={setEmployeeId} value={employeeId}>
                            <SelectTrigger><SelectValue placeholder={t('selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => <SelectItem key={e.id} value={e.id!}>{e.employee_name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="description">
              {t('description')} 
              {expenseType === 'others' && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
             <div className="space-y-2">
                <Label htmlFor="amount">{t('amount')} <span className="text-destructive">*</span></Label>
                <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="currency">{t('currency')} <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setCurrency(v as Currency)} value={currency}>
                    <SelectTrigger><SelectValue placeholder={t('selectCurrency')} /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="AED">AED</SelectItem>
                        <SelectItem value="UZS">UZS</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">{t('date')} <span className="text-destructive">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>{t('pickADate')}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">{t('cancel')}</Button>
          </DialogClose>
          <Button type="button" onClick={handleSubmit}>{t('saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
