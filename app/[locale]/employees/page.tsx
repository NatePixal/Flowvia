
'use client';
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MoreHorizontal, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import type { Employee } from '@/lib/types';
import AddEmployeeDialog from '@/components/employees/add-employee-dialog';
import EditEmployeeDialog from '@/components/employees/edit-employee-dialog';
import EmployeeSalarySheet from '@/components/employees/employee-salary-sheet';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function EmployeesPage() {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const { data: employees, isLoading: isLoading } = useCompanyCollection<Employee>('employees');

  const handleAddEmployee = async (employeeData: Omit<Employee, 'id' | 'createdAt' | 'companyId'>) => {
    if (!firestore || !userProfile?.companyId) return;
    try {
      await addDoc(collection(firestore, 'employees'), {
        ...employeeData,
        companyId: userProfile.companyId,
        createdAt: serverTimestamp(),
      });
      toast({ title: t('employeeAdded'), description: `${employeeData.employee_name} ${t('hasBeenAdded')}` });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotAddEmployee') });
    }
  };

  const handleUpdateEmployee = async (employeeId: string, employeeData: Partial<Omit<Employee, 'id' | 'companyId'>>) => {
    if (!firestore) return;
    try {
      const employeeRef = doc(firestore, 'employees', employeeId);
      await updateDoc(employeeRef, employeeData);
      toast({ title: t('employeeUpdated'), description: t('employeeInfoUpdated') });
      setIsEditDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateEmployee') });
    }
  }
  
  const openEditDialog = useCallback((employee: Employee) => {
    setSelectedEmployee(employee);
    setIsEditDialogOpen(true);
  }, []);

  const openSalarySheet = useCallback((employee: Employee) => {
    setSelectedEmployee(employee);
    setIsSheetOpen(true);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">{t('employeeManagement')}</h1>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t('addEmployee')}
            </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('employeeList')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && <p>{t('loading')}...</p>}
            {!isLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('employeeName')}</TableHead>
                    <TableHead>{t('role')}</TableHead>
                    <TableHead>{t('employmentType')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead className="text-center">{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employees || []).map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.employee_name}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell>{t(employee.employment_type)}</TableCell>
                      <TableCell>
                        <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className={employee.status === 'active' ? 'bg-green-500/20 text-green-700 border-green-500/30' : ''}>
                          {t(employee.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                                {t('edit')}
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => openSalarySheet(employee)}>
                                <History className="mr-2 h-4 w-4" />
                                {t('salaryHistory')}
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
