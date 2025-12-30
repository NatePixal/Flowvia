
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Employee, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

interface EditEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  onUpdateEmployee: (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>) => void;
}

export default function EditEmployeeDialog({ open, onOpenChange, employee, onUpdateEmployee }: EditEmployeeDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [employeeName, setEmployeeName] = useState('');
  const [role, setRole] = useState('');
  const [employmentType, setEmploymentType] = useState<Employee['employment_type'] | ''>('');
  const [salaryType, setSalaryType] = useState<Employee['salary_type'] | ''>('');
  const [defaultSalaryAmount, setDefaultSalaryAmount] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState<Currency | ''>('');
  const [status, setStatus] = useState<Employee['status']>('active');

  useEffect(() => {
    if (employee) {
      setEmployeeName(employee.employee_name);
      setRole(employee.role);
      setEmploymentType(employee.employment_type);
      setSalaryType(employee.salary_type);
      setDefaultSalaryAmount(String(employee.default_salary_amount));
      setSalaryCurrency(employee.salary_currency);
      setStatus(employee.status);
    }
  }, [employee]);

  const handleSubmit = () => {
    if (!employeeName || !role || !employmentType || !salaryType || !defaultSalaryAmount || !salaryCurrency) {
      toast({ variant: 'destructive', title: t('missingFields'), description: t('pleaseFillAllRequiredFields') });
      return;
    }
    onUpdateEmployee(employee.id, { 
        employee_name: employeeName, 
        role, 
        employment_type: employmentType, 
        salary_type: salaryType, 
        default_salary_amount: parseFloat(defaultSalaryAmount), 
        salary_currency: salaryCurrency, 
        status 
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('editEmployee')}</DialogTitle>
          <DialogDescription>{t('editTheDetailsOfTheEmployee')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('employeeName')} <span className="text-destructive">*</span></Label>
            <Input id="name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t('rolePosition')} <span className="text-destructive">*</span></Label>
            <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employmentType">{t('employmentType')} <span className="text-destructive">*</span></Label>
            <Select onValueChange={(v) => setEmploymentType(v as Employee['employment_type'])} value={employmentType}>
              <SelectTrigger><SelectValue placeholder={t('selectEmploymentType')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="seller">{t('seller')}</SelectItem>
                <SelectItem value="staff">{t('staff')}</SelectItem>
                <SelectItem value="admin">{t('admin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="salaryType">{t('salaryType')} <span className="text-destructive">*</span></Label>
            <Select onValueChange={(v) => setSalaryType(v as Employee['salary_type'])} value={salaryType}>
              <SelectTrigger><SelectValue placeholder={t('selectSalaryType')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">{t('daily')}</SelectItem>
                <SelectItem value="weekly">{t('weekly')}</SelectItem>
                <SelectItem value="monthly">{t('monthly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
                <Label htmlFor="salaryAmount">{t('salaryAmount')} <span className="text-destructive">*</span></Label>
                <Input id="salaryAmount" type="number" value={defaultSalaryAmount} onChange={(e) => setDefaultSalaryAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label htmlFor="salaryCurrency">{t('currency')} <span className="text-destructive">*</span></Label>
                <Select onValueChange={(v) => setSalaryCurrency(v as Currency)} value={salaryCurrency}>
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
            <Label htmlFor="status">{t('status')}</Label>
            <Select onValueChange={(value: 'active' | 'inactive') => setStatus(value)} value={status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('active')}</SelectItem>
                <SelectItem value="inactive">{t('inactive')}</SelectItem>
              </SelectContent>
            </Select>
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
