'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { DailyExpense, Currency, Seller, Employee, FxSnapshot, Location } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { useFirebase } from '@/firebase';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { normalizeRateToBase } from '@/lib/money';


interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: DailyExpense;
  onUpdateExpense: (expenseId: string, expenseData: Partial<DailyExpense>) => void;
  sellers: Seller[];
  employees: Employee[];
}

export default function EditExpenseDialog({ open, onOpenChange, expense, onUpdateExpense, sellers, employees }: EditExpenseDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();
  const { companyBaseCurrency, locationsEnabled } = useFirebase();

  const [expenseType, setExpenseType] = useState<DailyExpense['expenseType'] | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [date, setDate] = useState<Date | undefined>();

  const { data: locations } = useCompanyCollection<Location>('locations');
  const [locationId, setLocationId] = useState('');
  
  const [salaryRecipientType, setSalaryRecipientType] = useState<'seller' | 'employee' | ''>('');
  const [sellerId, setSellerId] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const [fxRate, setFxRate] = useState('');
  const showFxInput = useMemo(() => currency && companyBaseCurrency && currency !== companyBaseCurrency, [currency, companyBaseCurrency]);

  useEffect(() => {
    if (expense) {
        setExpenseType(expense.expenseType);
        setDescription(expense.description);
        setAmount(String(expense.amount));
        setCurrency(expense.currency);
        setLocationId(String((expense as any).locationId || ''));
        setFxRate(String(expense.fx?.enteredRate || ''));
        
        const d = (() => {
            const v = expense.date;
            if (!v) return undefined;
            if (v instanceof Date) return v;
            if (v instanceof Timestamp) return v.toDate();
            if (typeof v === 'string') {
              const x = new Date(v);
              return isNaN(x.getTime()) ? undefined : x;
            }
            return undefined; // FieldValue sentinel
        })();
        setDate(d);
        
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
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('toast.error.pleaseFillAllRequiredFields') });
      return;
    }
    if (locationsEnabled && !locationId) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('expenses.locationRequired') });
      return;
    }

    if (showFxInput && !fxRate) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('expenses.exchangeRateIsRequiredForThisCurrency') });
      return;
    }
    
    const expenseData: Partial<DailyExpense> = {
      expenseType,
      description,
      amount: parseFloat(amount),
      currency,
      date: Timestamp.fromDate(date),
      paid_to_seller_id: salaryRecipientType === 'seller' ? sellerId : undefined,
      paid_to_seller_name: salaryRecipientType === 'seller' ? sellers.find(s => s.id === sellerId)?.name : undefined,
      employee_id: salaryRecipientType === 'employee' ? employeeId : undefined,
      employee_name: salaryRecipientType === 'employee' ? employees.find(e => e.id === employeeId)?.employee_name : undefined,
      locationId: locationsEnabled ? locationId : undefined,
      locationName: locationsEnabled ? (locations || []).find(l => l.id === locationId)?.name : undefined,
    };
    
    if (showFxInput && companyBaseCurrency) {
      const enteredRate = parseFloat(fxRate);
      const fxPair = `${companyBaseCurrency}->${currency}`;
      expenseData.fx = {
        rateToBase: normalizeRateToBase(enteredRate, fxPair, currency, companyBaseCurrency),
        enteredRate,
        enteredPair: fxPair,
        capturedAt: serverTimestamp(),
      } as FxSnapshot;
    } else {
      expenseData.fx = undefined; // Clear FX if not needed
    }
    
    onUpdateExpense(expense.id!, expenseData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('expenses.editExpense')}</DialogTitle>
            <DialogDescription>{t('expenses.editTheDetailsOfTheExpense')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expenseType">{t('expenses.expenseType')} <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setExpenseType(v as DailyExpense['expenseType'])} value={expenseType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('expenses.selectExpenseType')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="food">{t('expenses.food')}</SelectItem>
                  <SelectItem value="salary">{t('expenses.salary')}</SelectItem>
                  <SelectItem value="transport">{t('expenses.transport')}</SelectItem>
                  <SelectItem value="rent">{t('expenses.rent')}</SelectItem>
                  <SelectItem value="utilities">{t('expenses.utilities')}</SelectItem>
                  <SelectItem value="marketing">{t('expenses.marketing')}</SelectItem>
                  <SelectItem value="others">{t('expenses.others')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {locationsEnabled && (
              <div className="space-y-2">
                <Label htmlFor="location">{t('expenses.location')} <span className="text-destructive">*</span></Label>
                <Select onValueChange={setLocationId} value={locationId}>
                  <SelectTrigger><SelectValue placeholder={t('expenses.selectLocation')} /></SelectTrigger>
                  <SelectContent>
                    {(locations || []).filter(l => l.active !== false).map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {expenseType === 'salary' && (
              <div className="space-y-3 rounded-md border p-4">
                  <Label>{t('expenses.recipient')} <span className="text-destructive">*</span></Label>
                  <RadioGroup value={salaryRecipientType} onValueChange={(v) => setSalaryRecipientType(v as 'seller' | 'employee')} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                          <RadioGroupItem value="seller" id="r_seller_edit" />
                          <Label htmlFor="r_seller_edit">{t('employees.seller')}</Label>
                      </div>
                       <div className="flex items-center space-x-2">
                          <RadioGroupItem value="employee" id="r_employee_edit" />
                          <Label htmlFor="r_employee_edit">{t('employees.employee')}</Label>
                      </div>
                  </RadioGroup>

                  {salaryRecipientType === 'seller' && (
                      <div className="space-y-2 pt-2">
                          <Label htmlFor="seller">{t('expenses.paidToSeller')} <span className="text-destructive">*</span></Label>
                          <Select onValueChange={setSellerId} value={sellerId}>
                              <SelectTrigger><SelectValue placeholder={t('expenses.selectSeller')} /></SelectTrigger>
                              <SelectContent>
                                  {sellers.map(s => <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>)}
                              </SelectContent>
                          </Select>
                      </div>
                  )}
                   {salaryRecipientType === 'employee' && (
                      <div className="space-y-2 pt-2">
                          <Label htmlFor="employee">{t('expenses.paidToEmployee')} <span className="text-destructive">*</span></Label>
                          <Select onValueChange={setEmployeeId} value={employeeId}>
                              <SelectTrigger><SelectValue placeholder={t('expenses.selectEmployee')} /></SelectTrigger>
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
                {t('expenses.description')} 
                {expenseType === 'others' && <span className="text-destructive"> *</span>}
              </Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
               <div className="space-y-2">
                  <Label htmlFor="amount">{t('expenses.amount')} <span className="text-destructive">*</span></Label>
                  <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="currency">{t('expenses.currency')} <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => setCurrency(v as Currency)} value={currency}>
                      <SelectTrigger><SelectValue placeholder={t('expenses.selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="SAR">SAR</SelectItem>
                          <SelectItem value="JOD">JOD</SelectItem>
                          <SelectItem value="EGP">EGP</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                          <SelectItem value="CNY">CNY</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>

            {showFxInput && (
              <div className="space-y-2 rounded-md border border-yellow-500/50 bg-yellow-500/5 p-3">
                  <Label htmlFor="fxRate">
                    {t('expenses.exchangeRate')} ({companyBaseCurrency} &rarr; {currency})
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input 
                    id="fxRate" 
                    type="number" 
                    value={fxRate} 
                    onChange={(e) => setFxRate(e.target.value)} 
                    placeholder={`${t('expenses.howMany')} ${currency} ${t('expenses.for')} 1 ${companyBaseCurrency}`}
                  />
                   <p className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5"/>{t('expenses.thisRateWillBeLockedForTheTransaction')}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="date">{t('expenses.date')} <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>{t('placeholder.pickADate')}</span>}
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
              <Button type="button" variant="secondary">{t('clients.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('expenses.saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
