"use client";

import { useMemo, useState } from "react";
import { useFirebase } from "@/firebase/provider";
import { useCompanyCollection } from "@/hooks/use-company-collection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DateRangePicker from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Client, Product, Supplier, Currency } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { add, format } from "date-fns";
import { useCurrency } from "@/lib/currency-provider";

type StatementType = 'client' | 'supplier' | 'expenses' | 'product';

// The new download helper function
async function downloadExcel(callableName: string, payload: any) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, callableName);
  const res: any = await fn(payload);
  const url = res?.data?.downloadUrl;
  if (!url) throw new Error("No downloadUrl returned from function.");

  // This does NOT get blocked by pop-ups
  const a = document.createElement("a");
  a.href = url;
  a.target = "_self"; // No new tab
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function DataToolsPage() {
  const { t, i18n } = useTranslation();
  const { companyId, userProfile, firebaseApp } = useFirebase();
  const { currency } = useCurrency();
  const { toast } = useToast();
  const canExportStatement = userProfile?.role === 'admin' || userProfile?.role === 'developer';

  const { data: products, loading: productsLoading } = useCompanyCollection<Product>("products");
  const { data: clients, loading: clientsLoading } = useCompanyCollection<Client>("clients");
  const { data: suppliers, loading: suppliersLoading } = useCompanyCollection<Supplier>("suppliers");

  const [exportingType, setExportingType] = useState<StatementType | null>(null);
  const [statementDateRange, setStatementDateRange] = useState<DateRange | undefined>({
    from: add(new Date(), { days: -30 }),
    to: new Date(),
  });
  
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<string>("");

  const handleExport = async (statementType: StatementType) => {
    if (!canExportStatement || !companyId || !statementDateRange?.from) return;

    setExportingType(statementType);
    try {
        let payload: any = {
            companyId,
            from: format(statementDateRange.from, 'yyyy-MM-dd'),
            to: format(statementDateRange.to || statementDateRange.from, 'yyyy-MM-dd'),
            currency,
            locale: i18n.language,
        };
        let callableName = '';

        if (statementType === 'client') {
            if (!selectedClient) {
                toast({ variant: 'destructive', title: 'Client Required' });
                setExportingType(null);
                return;
            }
            callableName = 'exportClientStatement';
            payload.clientId = selectedClient;
        } else if (statementType === 'supplier') {
            if (!selectedSupplier) {
                toast({ variant: 'destructive', title: 'Supplier Required' });
                setExportingType(null);
                return;
            }
            callableName = 'exportSupplierStatement';
            payload.supplierId = selectedSupplier;
        } else if (statementType === 'expenses') {
            callableName = 'exportExpenseStatement';
        } else if (statementType === 'product') {
            if (!selectedProduct) {
                toast({ variant: 'destructive', title: 'Product Required' });
                setExportingType(null);
                return;
            }
            callableName = 'exportProductStatement';
            payload.productId = selectedProduct;
        }

        if (!callableName) {
            throw new Error("Invalid statement type selected.");
        }
        
        await downloadExcel(callableName, payload);
        toast({ title: 'Export Started', description: 'Your statement is downloading.' });

    } catch (err: any) {
        console.error('Statement export failed:', err);
        toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    } finally {
        setExportingType(null);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{"Data Export Engine"}</CardTitle>
          <CardDescription>{"Generate professional accounting statements."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div className="space-y-2">
                <Label>Date Range</Label>
                <DateRangePicker date={statementDateRange} onDateChange={setStatementDateRange} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Client Statement</Label>
                    <Select value={selectedClient} onValueChange={setSelectedClient} disabled={clientsLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a client..." /></SelectTrigger>
                        <SelectContent>{(clients || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExport('client')} disabled={!!exportingType || !selectedClient}>
                       {exportingType === 'client' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Client Statement
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Supplier Statement</Label>
                    <Select value={selectedSupplier} onValueChange={setSelectedSupplier} disabled={suppliersLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a supplier..." /></SelectTrigger>
                        <SelectContent>{(suppliers || []).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExport('supplier')} disabled={!!exportingType || !selectedSupplier}>
                       {exportingType === 'supplier' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Supplier Statement
                    </Button>
                </div>
            </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Expenses Statement</Label>
                    <p className="text-sm text-muted-foreground">Export all expenses in range.</p>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExport('expenses')} disabled={!!exportingType}>
                        {exportingType === 'expenses' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Export Expense Statement
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Product Movement</Label>
                    <Select value={selectedProduct} onValueChange={setSelectedProduct} disabled={productsLoading}>
                        <SelectTrigger><SelectValue placeholder="Select a product..." /></SelectTrigger>
                        <SelectContent>{(products || []).map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.productCode})</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExport('product')} disabled={!!exportingType || !selectedProduct}>
                       {exportingType === 'product' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Product Statement
                    </Button>
                </div>
            </div>

        </CardContent>
      </Card>
    </div>
  );
}
