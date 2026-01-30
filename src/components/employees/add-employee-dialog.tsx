'use client';

import { useState } from 'react';
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

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddEmployee: (employee: Omit<Employee, 'id' | 'createdAt' | 'companyId'>) => void;
}

export default function AddEmployeeDialog({ open, onOpenChange, onAddEmployee }: AddEmployeeDialogProps) {
  const { t, ready } = useTranslation();
  const { toast } = useToast();

  const [employeeName, setEmployeeName] = useState('');
  const [role, setRole] = useState('');
  const [employmentType, setEmploymentType] = useState<Employee['employment_type'] | ''>('');
  const [salaryType, setSalaryType] = useState<Employee['salary_type'] | ''>('');
  const [defaultSalaryAmount, setDefaultSalaryAmount] = useState('');
  const [salaryCurrency, setSalaryCurrency] = useState<Currency | ''>('');
  const [status, setStatus] = useState<Employee['status']>('active');

  const handleSubmit = () => {
    if (!employeeName || !role || !employmentType || !salaryType || !defaultSalaryAmount || !salaryCurrency) {
      toast({ variant: 'destructive', title: t('toast.error.missingFields'), description: t('toast.error.pleaseFillAllRequiredFields') });
      return;
    }
    onAddEmployee({
        employee_name: employeeName,
        role,
        employment_type: employmentType,
        salary_type: salaryType,
        default_salary_amount: parseFloat(defaultSalaryAmount),
        salary_currency: salaryCurrency,
        status
    });
    // Reset form
    setEmployeeName('');
    setRole('');
    setEmploymentType('');
    setSalaryType('');
    setDefaultSalaryAmount('');
    setSalaryCurrency('');
    setStatus('active');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {ready && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('employees.addEmployee')}</DialogTitle>
            <DialogDescription>{t('employees.addANewEmployeeToYourTeam')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('employees.employeeName')} <span className="text-destructive">*</span></Label>
              <Input id="name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">{t('employees.rolePosition')} <span className="text-destructive">*</span></Label>
              <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentType">{t('employees.employmentType')} <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setEmploymentType(v as Employee['employment_type'])} value={employmentType}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectEmploymentType')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">{t('employees.seller')}</SelectItem>
                  <SelectItem value="staff">{t('employees.staff')}</SelectItem>
                  <SelectItem value="admin">{t('employees.admin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="salaryType">{t('employees.salaryType')} <span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => setSalaryType(v as Employee['salary_type'])} value={salaryType}>
                <SelectTrigger><SelectValue placeholder={t('employees.selectSalaryType')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t('employees.daily')}</SelectItem>
                  <SelectItem value="weekly">{t('employees.weekly')}</SelectItem>
                  <SelectItem value="monthly">{t('employees.monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                  <Label htmlFor="salaryAmount">{t('employees.salaryAmount')} <span className="text-destructive">*</span></Label>
                  <Input id="salaryAmount" type="number" value={defaultSalaryAmount} onChange={(e) => setDefaultSalaryAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="salaryCurrency">{t('employees.currency')} <span className="text-destructive">*</span></Label>
                  <Select onValueChange={(v) => setSalaryCurrency(v as Currency)} value={salaryCurrency}>
                      <SelectTrigger><SelectValue placeholder={t('employees.selectCurrency')} /></SelectTrigger>
                      <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="AED">AED</SelectItem>
                          <SelectItem value="UZS">UZS</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">{t('employees.status')}</Label>
              <Select onValueChange={(value: 'active' | 'inactive') => setStatus(value)} value={status}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('status.active')}</SelectItem>
                  <SelectItem value="inactive">{t('status.inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">{t('clients.cancel')}</Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit}>{t('employees.addEmployee')}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
