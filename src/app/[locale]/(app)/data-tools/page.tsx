"use client";

import { useMemo, useState } from "react";
import { useFirebase } from "@/firebase/provider";
import { useCompanyCollection } from "@/hooks/use-company-collection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExcelImportDialog } from "@/components/data/excel-import-dialog";

import { TPL_PRODUCTS, TPL_EXPENSES, TPL_CLIENT_LEDGER, TPL_EMPLOYEE_SALARY } from "@/lib/excel/templates";
import { importProductsXlsx, importExpensesXlsx, importClientLedgerXlsx, importEmployeeSalaryXlsx } from "@/lib/excel/importers";
import { exportInventoryXlsx, exportExpensesXlsx, exportClientLedgerXlsx } from "@/lib/excel/exporters";

import { Client, DailyExpense, Employee, Product, ClientLedgerEntry } from "@/lib/types";
import { useTranslation } from "react-i18next";

export default function DataToolsPage() {
  const { t } = useTranslation();
  const { firestore, companyId, userProfile } = useFirebase();
  const canWrite = userProfile?.role === 'admin' || userProfile?.role === 'developer';

  const { data: products, loading: productsLoading } = useCompanyCollection<Product>("products");
  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>("dailyExpenses");
  const { data: clients, loading: clientsLoading } = useCompanyCollection<Client>("clients");
  const { data: employees, loading: employeesLoading } = useCompanyCollection<Employee>("employees");

  const [openProducts, setOpenProducts] = useState(false);
  const [openExpenses, setOpenExpenses] = useState(false);
  const [openClientLedger, setOpenClientLedger] = useState(false);
  const [openEmpSalary, setOpenEmpSalary] = useState(false);

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");

  const { data: clientLedger, loading: clientLedgerLoading } = useCompanyCollection<ClientLedgerEntry>(
    selectedClientId ? `clients/${selectedClientId}/ledger` : ""
  );

  const selectedClient = useMemo(
    () => (clients || []).find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  const selectedEmployee = useMemo(
    () => (employees || []).find((e) => e.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  );

  const salaryExpensesForEmployee = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return (expenses || []).filter((e: any) => e.expenseType === "salary" && e.employee_id === selectedEmployeeId);
  }, [expenses, selectedEmployeeId]);

  if (!firestore || !companyId) {
    return <div className="p-6">{t('misc.loading')}...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('dataTools.pageTitle')}</CardTitle>
          <CardDescription>{t('dataTools.pageDescription')}</CardDescription>
        </CardHeader>
      </Card>

      {/* INVENTORY */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataTools.inventory')}</CardTitle>
          <CardDescription>{t('dataTools.inventoryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportInventoryXlsx(`inventory_${companyId}.xlsx`, products || [])}
            disabled={productsLoading}
          >
            {t('dataTools.exportProducts')}
          </Button>
          <Button onClick={() => setOpenProducts(true)} disabled={!canWrite}>
            {t('dataTools.importProducts')}
          </Button>

          <ExcelImportDialog
            open={openProducts}
            onOpenChange={setOpenProducts}
            title={t('dataTools.importProductsTitle')}
            description={t('dataTools.importProductsDescription')}
            template={TPL_PRODUCTS}
            disabled={!canWrite}
            onImport={(file) => importProductsXlsx(firestore, companyId, file)}
          />
        </CardContent>
      </Card>

      {/* EXPENSES */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataTools.expenses')}</CardTitle>
          <CardDescription>{t('dataTools.expensesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => exportExpensesXlsx(`expenses_${companyId}.xlsx`, expenses || [])}
            disabled={expensesLoading}
          >
            {t('dataTools.exportExpenses')}
          </Button>
          <Button onClick={() => setOpenExpenses(true)} disabled={!canWrite}>
            {t('dataTools.importExpenses')}
          </Button>

          <ExcelImportDialog
            open={openExpenses}
            onOpenChange={setOpenExpenses}
            title={t('dataTools.importExpensesTitle')}
            template={TPL_EXPENSES}
            disabled={!canWrite}
            onImport={(file) => importExpensesXlsx(firestore, companyId, file)}
          />
        </CardContent>
      </Card>

      {/* CLIENT LOANS: per client */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataTools.clientLoans')}</CardTitle>
          <CardDescription>{t('dataTools.clientLoansDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="border rounded-md p-2 w-full max-w-md"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            disabled={clientsLoading}
          >
            <option value="">{t('dataTools.selectClient')}</option>
            {(clients || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex gap-2 flex-wrap">
             <Button
              variant="outline"
              disabled={!selectedClient || clientLedgerLoading}
              onClick={() => {
                if (!selectedClient) return;
                exportClientLedgerXlsx(
                  `client_ledger_${selectedClient.name}_${companyId}.xlsx`,
                  selectedClient,
                  clientLedger || []
                );
              }}
            >
              {t('dataTools.exportClientLedger')}
            </Button>
            <Button onClick={() => setOpenClientLedger(true)} disabled={!canWrite || !selectedClientId}>
              {t('dataTools.importForSelectedClient')}
            </Button>
          </div>

          <ExcelImportDialog
            open={openClientLedger}
            onOpenChange={setOpenClientLedger}
            title={t('dataTools.importClientLedgerTitle')}
            description={t('dataTools.importClientLedgerDescription')}
            template={TPL_CLIENT_LEDGER}
            disabled={!canWrite || !selectedClientId}
            onImport={(file) => importClientLedgerXlsx(firestore, companyId, selectedClientId, file)}
          />
        </CardContent>
      </Card>

      {/* EMPLOYEE: per employee salary import */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dataTools.employeeSalary')}</CardTitle>
          <CardDescription>{t('dataTools.employeeSalaryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="border rounded-md p-2 w-full max-w-md"
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            disabled={employeesLoading}
          >
            <option value="">{t('dataTools.selectEmployee')}</option>
            {(employees || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_name}
              </option>
            ))}
          </select>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              disabled={!selectedEmployee}
              onClick={() => {
                if (!selectedEmployee) return;
                // optional export for that employee (already available in exporters.ts)
                // you can wire it if you want
              }}
            >
              {t('dataTools.exportEmployeeSalary')}
            </Button>

            <Button onClick={() => setOpenEmpSalary(true)} disabled={!canWrite || !selectedEmployeeId}>
              {t('dataTools.importEmployeeSalary')}
            </Button>
          </div>

          <ExcelImportDialog
            open={openEmpSalary}
            onOpenChange={setOpenEmpSalary}
            title={t('dataTools.importEmployeeSalaryTitle')}
            template={TPL_EMPLOYEE_SALARY}
            disabled={!canWrite || !selectedEmployeeId}
            onImport={(file) =>
              importEmployeeSalaryXlsx(firestore, companyId, file, (name) => {
                const found = (employees || []).find((e) => e.employee_name?.trim() === name.trim());
                return found?.id || null;
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
