
"use client";

import { useMemo, useState } from "react";
import { useFirebase } from "@/firebase/provider";
import { useCompanyCollection } from "@/hooks/use-company-collection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExcelImportDialog } from "@/components/data/excel-import-dialog";
import DateRangePicker from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { TPL_PRODUCTS, TPL_EXPENSES, TPL_CLIENT_LEDGER, TPL_EMPLOYEE_SALARY } from "@/lib/excel/templates";
import { importProductsXlsx, importExpensesXlsx, importClientLedgerXlsx, importEmployeeSalaryXlsx } from "@/lib/excel/importers";
import { exportInventoryXlsx, exportExpensesXlsx, exportClientLedgerXlsx } from "@/lib/excel/exporters";

import { Client, DailyExpense, Employee, Product, ClientLedgerEntry, Supplier } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { add } from "date-fns";

export default function DataToolsPage() {
  const { t } = useTranslation();
  const { firestore, companyId, userProfile, firebaseApp } = useFirebase();
  const { toast } = useToast();
  const canWrite = userProfile?.role === 'admin' || userProfile?.role === 'developer';
  const canExportStatement = canWrite;

  const { data: products, loading: productsLoading } = useCompanyCollection<Product>("products");
  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>("dailyExpenses");
  const { data: clients, loading: clientsLoading } = useCompanyCollection<Client>("clients");
  const { data: suppliers, loading: suppliersLoading } = useCompanyCollection<Supplier>("suppliers");
  const { data: employees, loading: employeesLoading } = useCompanyCollection<Employee>("employees");

  const [openProducts, setOpenProducts] = useState(false);
  const [openExpenses, setOpenExpenses] = useState(false);
  const [openClientLedger, setOpenClientLedger] = useState(false);
  const [openEmpSalary, setOpenEmpSalary] = useState(false);

  // Statement export state
  const [isExporting, setIsExporting] = useState(false);
  const [statementDateRange, setStatementDateRange] = useState<DateRange | undefined>({
    from: add(new Date(), { days: -30 }),
    to: new Date(),
  });
  
  // Target selections
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const handleExportStatement = async (statementType: 'client' | 'supplier' | 'expenses' | 'productMovement') => {
    if (!canExportStatement || !companyId || !statementDateRange?.from) return;

    let targetId: string | undefined = undefined;

    if (statementType === 'client') targetId = selectedClient;
    if (statementType === 'supplier') targetId = selectedSupplier;
    if (statementType === 'productMovement') targetId = selectedProduct;
    
    if ((statementType === 'client' || statementType === 'supplier' || statementType === 'productMovement') && !targetId) {
        toast({ variant: 'destructive', title: 'Target Required', description: `Please select a ${statementType}.` });
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
            if (result.data.warnings?.length > 0) {
              toast({
                variant: "destructive",
                title: "Export Warnings",
                description: result.data.warnings.join("\n"),
                duration: 10000,
              });
            }
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
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label>Date Range</Label>
                <DateRangePicker date={statementDateRange} onDateChange={setStatementDateRange} />
            </div>

            {/* Client Statement */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Client Statement</Label>
                    <Select value={selectedClient} onValueChange={setSelectedClient} disabled={clientsLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                        <SelectContent>
                            {(clients || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('client')} disabled={isExporting || !statementDateRange?.from || !selectedClient}>
                       {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Client Statement
                    </Button>
                </div>
            </div>

            {/* Supplier Statement */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Supplier Statement</Label>
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={suppliersLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a supplier..." /></SelectTrigger>
                        <SelectContent>
                            {(suppliers || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('supplier')} disabled={isExporting || !statementDateRange?.from || !selectedSupplier}>
                       {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Supplier Statement
                    </Button>
                </div>
            </div>

            {/* Expenses Statement */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Expenses Statement</Label>
                    <p className="text-sm text-muted-foreground">Export all expenses within the selected date range.</p>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('expenses')} disabled={isExporting || !statementDateRange?.from}>
                        {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Export Expense Statement
                    </Button>
                </div>
            </div>

            {/* Product Movement Statement */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Product Movement</Label>
                    <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={productsLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a product..." /></SelectTrigger>
                        <SelectContent>
                            {(products || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.productCode})</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('productMovement')} disabled={isExporting || !statementDateRange?.from || !selectedProduct}>
                       {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Product Statement
                    </Button>
                </div>
            </div>

        </CardContent>
      </Card>
    </div>
  );
}
