
'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFirebase } from '@/firebase';
import { ensureTaxSettingsExists, generateVatReturn } from '@/lib/flowvia-functions';
import { useToast } from '@/hooks/use-toast';

const COUNTRY_BY_CURRENCY: Record<string, 'AE' | 'SA' | 'JO' | 'EG'> = {
  AED: 'AE',
  SAR: 'SA',
  JOD: 'JO',
  EGP: 'EG',
};

function currentPeriod() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function TaxVatTools() {
  const { companyId, companyBaseCurrency } = useFirebase();
  const { toast } = useToast();
  const [country, setCountry] = useState<'AE' | 'SA' | 'JO' | 'EG'>(COUNTRY_BY_CURRENCY[companyBaseCurrency || ''] || 'AE');
  const [period, setPeriod] = useState(currentPeriod());
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [loadingReturn, setLoadingReturn] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const periodLabel = useMemo(() => period || 'YYYY-MM', [period]);

  const onInitTax = async () => {
    if (!companyId) return;
    setLoadingSetup(true);
    try {
      const res = await ensureTaxSettingsExists({ companyId, country });
      toast({
        title: 'VAT settings ready',
        description: res?.created ? 'Tax settings were created.' : 'Tax settings already existed and were loaded.',
      });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'VAT setup failed', description: e?.message || 'Unknown error' });
    } finally {
      setLoadingSetup(false);
    }
  };

  const onGenerateVat = async () => {
    if (!companyId) return;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      toast({ variant: 'destructive', title: 'Invalid period', description: 'Use YYYY-MM format.' });
      return;
    }
    setLoadingReturn(true);
    try {
      const res = await generateVatReturn({ companyId, period });
      setLastResult(res);
      toast({ title: 'VAT return generated', description: `Period ${period} has been computed.` });
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'VAT return failed', description: e?.message || 'Unknown error' });
    } finally {
      setLoadingReturn(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>VAT / Tax Tools</CardTitle>
        <CardDescription>
          Initialize MENA VAT settings and generate monthly VAT returns for the selected period.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Country Pack</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose country" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AE">UAE (AE)</SelectItem>
                <SelectItem value="SA">Saudi Arabia (SA)</SelectItem>
                <SelectItem value="JO">Jordan (JO)</SelectItem>
                <SelectItem value="EG">Egypt (EG)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>VAT Period (YYYY-MM)</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-02" />
          </div>
          <div className="space-y-2">
            <Label>Company Base Currency</Label>
            <Input value={companyBaseCurrency || 'Not set'} disabled />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onInitTax} disabled={!companyId || loadingSetup}>
            {loadingSetup ? 'Initializing...' : 'Initialize VAT Settings'}
          </Button>
          <Button variant="outline" onClick={onGenerateVat} disabled={!companyId || loadingReturn}>
            {loadingReturn ? 'Generating...' : `Generate VAT Return (${periodLabel})`}
          </Button>
        </div>

        {lastResult && (
          <div className="rounded-md border p-3 text-sm space-y-1">
            <div><strong>Currency:</strong> {lastResult.currency}</div>
            <div><strong>Sales VAT (Output):</strong> {lastResult.outputVat?.totalVatMinor ?? 0}</div>
            <div><strong>Purchases VAT (Input):</strong> {lastResult.inputVat?.totalVatMinor ?? 0}</div>
            <div><strong>Net VAT Payable:</strong> {lastResult.netVatMinor ?? 0}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
