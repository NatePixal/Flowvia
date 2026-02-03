"use client";

import { useMemo, useState } from "react";
import { useFirebase } from "@/firebase/provider";
import { useCompanyCollection } from "@/hooks/use-company-collection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExcelImportDialog } from "@/components/data/excel-import-dialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";

import { TPL_PRODUCTS, TPL_EXPENSES, TPL_CLIENT_LEDGER, TPL_EMPLOYEE_SALARY } from "@/lib/excel/templates";
import { importProductsXlsx, importExpensesXlsx, importClientLedgerXlsx, importEmployeeSalaryXlsx } from "@/lib/excel/importers";
import { exportInventoryXlsx, exportExpensesXlsx, exportClientLedgerXlsx } from "@/lib/excel/exporters";

import { Client, DailyExpense, Employee, Product, ClientLedgerEntry } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function DataToolsPage() {
  const { t } = useTranslation();
  const { firestore, companyId, userProfile, firebaseApp } = useFirebase();
  const { toast } = useToast();
  const canWrite = userProfile?.role === 'admin' || userProfile?.role === 'developer';
  const canExportStatement = canWrite;

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

  // Statement export state
  const [isExporting, setIsExporting] = useState(false);
  const [statementDateRange, setStatementDateRange] = useState<DateRange | undefined>();
  const [selectedStatementTarget, setSelectedStatementTarget] = useState<string>("");

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

  const handleExportStatement = async (statementType: 'client' | 'supplier' | 'expenses') => {
    if (!canExportStatement || !companyId || !statementDateRange?.from) return;

    let targetId: string | undefined = undefined;
    if (statementType === 'client') targetId = selectedStatementTarget;
    if (statementType === 'supplier') targetId = selectedStatementTarget;
    if (!targetId && (statementType === 'client' || statementType === 'supplier')) {
        toast({ variant: 'destructive', title: 'Target Required', description: 'Please select a client or supplier.' });
        return;
    }

    setIsExporting(true);
    try {
        const functions = getFunctions(firebaseApp, 'us-central1');
        const exportStatementFn = httpsCallable(functions, 'exportStatement');
        
        const result: any = await exportStatementFn({
            companyId,
            statementType,
            targetId,
            dateFrom: statementDateRange.from.toISOString(),
            dateTo: (statementDateRange.to || statementDateRange.from).toISOString(),
        });
        
        if (result.data.success && result.data.downloadUrl) {
            window.open(result.data.downloadUrl, '_blank');
            toast({ title: 'Export Complete', description: 'Your statement is downloading.' });
        } else {
            throw new Error(result.data.error || 'Failed to generate statement.');
        }

    } catch (err: any) {
        console.error('Statement export failed:', err);
        toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    } finally {
        setIsExporting(false);
    }
  };

  if (!firestore || !companyId) {
    return <div className="p-6">{t('misc.loading')}...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{"Data Export Engine"}</CardTitle>
          <CardDescription>{"Generate bank-style accounting statements for auditing and analysis."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="space-y-2">
                <Label>Date Range</Label>
                <DateRangePicker date={statementDateRange} onDateChange={setStatementDateRange} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Statement Type</Label>
                    <Select value={selectedStatementTarget} onValueChange={setSelectedStatementTarget}>
                        <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                        <SelectContent>
                            {(clients || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('client')} disabled={isExporting || !statementDateRange?.from || !selectedStatementTarget}>
                       {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Client Statement
                    </Button>
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Expenses</Label>
                    <p className="text-sm text-muted-foreground">Export all expenses within the date range.</p>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('expenses')} disabled={isExporting || !statementDateRange?.from}>
                        {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Export Expense Statement
                    </Button>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{"Legacy Data Tools"}</CardTitle>
          <CardDescription>{"Import and export data using simple XLSX files."}</CardDescription>
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