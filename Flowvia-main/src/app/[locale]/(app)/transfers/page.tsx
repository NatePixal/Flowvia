'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Location, Product, Transfer } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { createTransferFifoFn } from '@/lib/flowvia-functions';

type Line = { productId: string; name: string; qty: number };

export default function TransfersPage() {
  const { t } = useTranslation();
  const { companyId, userProfile, locationsEnabled } = useFirebase();
  const { toast } = useToast();

  const canView = hasPermission(userProfile, 'transfers', 'view');
  const canCreate = hasPermission(userProfile, 'transfers', 'create');

  const { data: locations } = useCompanyCollection<Location>('locations');
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: transfers } = useCompanyCollection<Transfer>('transfers');

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');

  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [lines, setLines] = useState<Line[]>([]);

  const addLine = () => {
    const p = (products || []).find(p => p.id === productId);
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    if (!p) return;
    setLines(prev => {
      const idx = prev.findIndex(x => x.productId === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + q };
        return copy;
      }
      return [...prev, { productId: p.id, name: p.name, qty: q }];
    });
    setQty('1');
  };

  const removeLine = (id: string) => setLines(prev => prev.filter(x => x.productId !== id));

  const submit = async () => {
    if (!companyId) return;
    if (!locationsEnabled) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('transfers.enableLocationsFirst') });
      return;
    }
    if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('transfers.invalidLocations') });
      return;
    }
    if (lines.length === 0) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('transfers.noLines') });
      return;
    }

    try {
      await createTransferFifoFn({
        companyId,
        fromLocationId,
        toLocationId,
        items: lines.map(l => ({ productId: l.productId, quantity: l.qty })),
      });
      toast({ title: t('transfers.created'), description: t('transfers.createdDesc') });
      setLines([]);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('transfers.title')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  if (!locationsEnabled) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('transfers.title')}</h1>
        <p className="text-muted-foreground">{t('transfers.enableLocationsFirst')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('transfers.title')}</h1>
        <p className="text-muted-foreground">{t('transfers.desc')}</p>
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('transfers.createTitle')}</CardTitle>
          <CardDescription>{t('transfers.createDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('transfers.from')}</Label>
              <Select value={fromLocationId} onValueChange={setFromLocationId}>
                <SelectTrigger><SelectValue placeholder={t('transfers.selectFrom')} /></SelectTrigger>
                <SelectContent>
                  {(locations || []).filter(l => l.active !== false).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('transfers.to')}</Label>
              <Select value={toLocationId} onValueChange={setToLocationId}>
                <SelectTrigger><SelectValue placeholder={t('transfers.selectTo')} /></SelectTrigger>
                <SelectContent>
                  {(locations || []).filter(l => l.active !== false).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label>{t('transfers.product')}</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger><SelectValue placeholder={t('transfers.selectProduct')} /></SelectTrigger>
                <SelectContent>
                  {(products || []).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.productCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('transfers.qty')}</Label>
              <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>

          <Button variant="outline" onClick={addLine} disabled={!productId}>{t('transfers.addLine')}</Button>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transfers.product')}</TableHead>
                  <TableHead>{t('transfers.qty')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map(l => (
                  <TableRow key={l.productId}>
                    <TableCell className="font-medium">{l.name}</TableCell>
                    <TableCell>{l.qty}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="destructive" onClick={() => removeLine(l.productId)}>{t('misc.delete')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">{t('transfers.noLines')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button onClick={submit} disabled={!canCreate}>{t('transfers.post')}</Button>
          </div>
        </CardContent>
      </FancyCard>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('transfers.history')}</CardTitle>
          <CardDescription>{t('transfers.historyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('transfers.from')}</TableHead>
                  <TableHead>{t('transfers.to')}</TableHead>
                  <TableHead>{t('transfers.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(transfers || []).slice(0, 20).map((tr: any) => (
                  <TableRow key={tr.id}>
                    <TableCell>{tr.fromLocationName || tr.fromLocationId}</TableCell>
                    <TableCell>{tr.toLocationName || tr.toLocationId}</TableCell>
                    <TableCell>{tr.status || 'posted'}</TableCell>
                  </TableRow>
                ))}
                {(transfers || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">{t('transfers.noTransfers')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </FancyCard>
    </div>
  );
}
