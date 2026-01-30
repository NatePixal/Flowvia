'use client';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoreHorizontal, PlusCircle, User, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import AddEmployeeDialog from '@/components/employees/add-employee-dialog';
import EditEmployeeDialog from '@/components/employees/edit-employee-dialog';
import EmployeeSalarySheet from '@/components/employees/employee-salary-sheet';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { formatMoneyMinor, toMinor } from '@/lib/money';
import { FancyCard } from '../ui/fancy-card';

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { firestore, user, companyId } = useFirebase();
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const { data: employees, loading: employeesLoading } = useCompanyCollection<Employee>('employees');

  const handleAddEmployee = async (employeeData: Omit<Employee, 'id' | 'createdAt' | 'companyId'>) => {
    if (!firestore || !companyId) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
        return;
    }

    try {
        const employeesCollectionRef = companyCollection(firestore, companyId, 'employees');
        await addDoc(employeesCollectionRef, withCompanyId(companyId, {
            ...employeeData,
            createdAt: serverTimestamp(),
        }));

        toast({ title: t('toast.success.employeeAdded'), description: t('toast.success.employeeAddedSuccessfully') });
        setIsAddDialogOpen(false);
    } catch(e: any) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleUpdateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id'>>) => {
    if (!firestore || !companyId) return;
    try {
      const employeeRef = companyDoc(firestore, companyId, `employees/${employeeId}`);
      await updateDoc(employeeRef, employeeData);
      toast({ title: t('toast.success.employeeUpdated'), description: t('toast.success.employeeUpdatedSuccessfully') });
      setIsEditDialogOpen(false);
      setSelectedEmployee(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleDeleteEmployee = async (employeeToDelete: Employee) => {
    if (!firestore || !employeeToDelete?.id || !companyId) return;
     const ok = window.confirm(t('sellers.areYouSureYouWantToDelete', { name: employeeToDelete.employee_name }));
     if (!ok) return;

    try {
      await deleteDoc(companyDoc(firestore, companyId, `employees/${employeeToDelete.id}`));
      toast({ title: t('toast.success.employeeDeleted'), description: t('toast.success.employeeDeletedSuccessfully') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const openEditDialog = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsEditDialogOpen(true);
  };

  const openSheet = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsSheetOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('employees.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('employees.pageDescription')}</p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('employees.addEmployee')}
          </Button>
        </div>

        <FancyCard>
          <CardHeader>
              <CardTitle>{t('employees.employeeList')}</CardTitle>
              <CardDescription>{t('employees.pageDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {employeesLoading && <p>{t('misc.loading')}...</p>}
            {!employeesLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('employees.employeeName')}</TableHead>
                    <TableHead>{t('employees.rolePosition')}</TableHead>
                    <TableHead>{t('employees.salary')}</TableHead>
                    <TableHead>{t('employees.status')}</TableHead>
                    <TableHead className="text-center">{t('employees.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.employee_name}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell>{formatMoneyMinor(toMinor(employee.default_salary_amount, employee.salary_currency), employee.salary_currency)} / {t(`employees.${employee.salary_type}`)}</TableCell>
                      <TableCell>
                        <Badge variant={employee.status === 'active' ? 'secondary' : 'destructive'} className={employee.status === 'active' ? 'bg-green-100 text-green-800' : ''}>
                          {t(`status.${employee.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('employees.openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openSheet(employee)}>
                                <Eye className="mr-2 h-4 w-4" />
                                <span>{t('employees.viewSalaryHistory')}</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                                {t('employees.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDeleteEmployee(employee)} className="text-destructive">
                                {t('employees.delete')}
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
      <AddEmployeeDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddEmployee={handleAddEmployee}
      />
      {selectedEmployee && (
        <EditEmployeeDialog
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            employee={selectedEmployee}
            onUpdateEmployee={handleUpdateEmployee}
        />
      )}
       {selectedEmployee && (
        <EmployeeSalarySheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          employee={selectedEmployee}
        />
      )}
    </>
  );
}
