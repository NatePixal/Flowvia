
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
import { Client, Product, Supplier } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { add } from "date-fns";

type StatementType = 'client' | 'supplier' | 'expenses' | 'productMovement' | 'stockReport';
type StockMode = "range" | "asOfToday" | "both";

export default function DataToolsPage() {
  const { t, i18n } = useTranslation();
  const { firestore, companyId, userProfile, firebaseApp } = useFirebase();
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
  const [stockMode, setStockMode] = useState<StockMode>("range");

  const handleExportStatement = async (statementType: StatementType) => {
    if (!canExportStatement || !companyId || !statementDateRange?.from) return;

    setExportingType(statementType);
    
    const fromISO = statementDateRange.from.toISOString().slice(0, 10);
    const toISO = (statementDateRange.to || statementDateRange.from).toISOString().slice(0, 10);
    const baseCurrency = userProfile?.currency || 'USD';
    const locale = i18n.language;
    
    const payload: any = { companyId, statementType, dateFrom: fromISO, dateTo: toISO, locale };

    if (statementType === 'client') {
        if (!selectedClient) { toast({ variant: 'destructive', title: 'Client not selected' }); setExportingType(null); return; }
        payload.targetId = selectedClient;
        payload.baseCurrency = baseCurrency;

    } else if (statementType === 'supplier') {
        if (!selectedSupplier) { toast({ variant: 'destructive', title: 'Supplier not selected' }); setExportingType(null); return; }
        payload.targetId = selectedSupplier;
        payload.supplierName = suppliers.find(s => s.id === selectedSupplier)?.name;
        payload.baseCurrency = baseCurrency;

    } else if (statementType === 'expenses') {
         payload.baseCurrency = baseCurrency;

    } else if (statementType === 'productMovement') {
        if (!selectedProduct) { toast({ variant: 'destructive', title: 'Product not selected' }); setExportingType(null); return; }
        const product = products.find(p => p.id === selectedProduct);
        if (!product) { toast({ variant: 'destructive', title: 'Product details not found' }); setExportingType(null); return; }
        payload.targetId = selectedProduct;
        payload.productCode = product.productCode;
        payload.baseCurrency = baseCurrency;

    } else if (statementType === 'stockReport') {
        payload.stockMode = stockMode;
        payload.baseCurrency = baseCurrency;
    }

    const fn = httpsCallable(getFunctions(firebaseApp, 'us-central1'), "exportStatement");

    try {
        const res: any = await fn(payload);
        const { base64, filename, mimeType, warnings } = res.data || {};

        if (warnings && warnings.length > 0) {
          toast({ variant: 'destructive', title: 'Export Warnings', description: warnings.join('\n') });
        }

        if (!base64) {
          throw new Error("Invalid response from server: base64 data is missing.");
        }

        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }

        const blob = new Blob(
          [new Uint8Array(byteNumbers)],
          { type: mimeType || "application/octet-stream" }
        );

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "export.xlsx";
        document.body.appendChild(a); // Required for Firefox
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: 'Export Complete', description: 'Your file has started downloading.' });
    } catch (err: any) {
        console.error("Statement export failed:", err);
        toast({ variant: 'destructive', title: 'Export Failed', description: err.message });
    } finally {
        setExportingType(null);
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

            {/* Stock & Demand Report */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                    <Label>Stock & Demand Report</Label>
                     <Select value={stockMode} onValueChange={(v) => setStockMode(v as StockMode)} disabled={!!exportingType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="range">Date Range Movement</SelectItem>
                            <SelectItem value="asOfToday">As of Today</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex items-end">
                    <Button onClick={() => handleExportStatement('stockReport')} disabled={!!exportingType || !statementDateRange?.from}>
                       {exportingType === 'stockReport' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Stock Report
                    </Button>
                </div>
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
                    <Button onClick={() => handleExportStatement('client')} disabled={!!exportingType || !statementDateRange?.from || !selectedClient}>
                       {exportingType === 'client' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                    <Button onClick={() => handleExportStatement('supplier')} disabled={!!exportingType || !statementDateRange?.from || !selectedSupplier}>
                       {exportingType === 'supplier' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                    <Button onClick={() => handleExportStatement('expenses')} disabled={!!exportingType || !statementDateRange?.from}>
                        {exportingType === 'expenses' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
                    <Button onClick={() => handleExportStatement('productMovement')} disabled={!!exportingType || !statementDateRange?.from || !selectedProduct}>
                       {exportingType === 'productMovement' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                       Export Product Statement
                    </Button>
                </div>
            </div>

        </CardContent>
      </Card>
    </div>
  );
}