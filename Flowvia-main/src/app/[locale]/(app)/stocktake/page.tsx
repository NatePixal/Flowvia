'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Location, Product, Stocktake } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { applyStocktakeFifoFn } from '@/lib/flowvia-functions';

export default function StocktakePage() {
  const { t } = useTranslation();
  const { companyId, userProfile, locationsEnabled } = useFirebase();
  const { toast } = useToast();

  const canView = hasPermission(userProfile, 'stocktake', 'view');
  const canCreate = hasPermission(userProfile, 'stocktake', 'create');

  const { data: locations } = useCompanyCollection<Location>('locations');
  const { data: products } = useCompanyCollection<Product>('products');
  const { data: stocktakes } = useCompanyCollection<Stocktake>('stocktakes');

  const [locationId, setLocationId] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');

  const [counts, setCounts] = useState<Record<string, string>>({});

  const filteredProducts = useMemo(() => {
    const list = products || [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter(p => p.name.toLowerCase().includes(s) || p.productCode.toLowerCase().includes(s));
  }, [products, search]);

  const setCount = (productId: string, v: string) => {
    setCounts(prev => ({ ...prev, [productId]: v }));
  };

  const apply = async () => {
    if (!companyId) return;
    if (!locationsEnabled) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('stocktake.enableLocationsFirst') });
      return;
    }
    if (!locationId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('stocktake.locationRequired') });
      return;
    }

    const lines = Object.entries(counts)
      .filter(([_, v]) => v !== '' && v !== null && v !== undefined)
      .map(([productId, v]) => ({ productId, countedQty: Math.max(0, Math.floor(Number(v) || 0)) }));

    if (lines.length === 0) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('stocktake.noLines') });
      return;
    }

    try {
      await applyStocktakeFifoFn({ companyId, locationId, note: note.trim() || undefined, lines });
      toast({ title: t('stocktake.applied'), description: t('stocktake.appliedDesc') });
      setCounts({});
      setNote('');
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e?.message || t('toast.error.unexpectedError') });
    }
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('stocktake.title')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  if (!locationsEnabled) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('stocktake.title')}</h1>
        <p className="text-muted-foreground">{t('stocktake.enableLocationsFirst')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('stocktake.title')}</h1>
        <p className="text-muted-foreground">{t('stocktake.desc')}</p>
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('stocktake.createTitle')}</CardTitle>
          <CardDescription>{t('stocktake.createDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('stocktake.location')}</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder={t('stocktake.selectLocation')} /></SelectTrigger>
                <SelectContent>
                  {(locations || []).filter(l => l.active !== false).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('stocktake.note')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('stocktake.notePlaceholder')} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('stocktake.search')}</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('stocktake.searchPlaceholder')} />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('stocktake.product')}</TableHead>
                  <TableHead>{t('stocktake.code')}</TableHead>
                  <TableHead className="w-[180px]">{t('stocktake.counted')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{p.productCode}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={counts[p.id] ?? ''}
                        onChange={(e) => setCount(p.id, e.target.value)}
                        placeholder={t('stocktake.enterCount')}
                        disabled={!locationId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">{t('stocktake.noProducts')}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button onClick={apply} disabled={!canCreate || !locationId}>{t('stocktake.apply')}</Button>
          </div>
        </CardContent>
      </FancyCard>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('stocktake.history')}</CardTitle>
          <CardDescription>{t('stocktake.historyDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('stocktake.location')}</TableHead>
                  <TableHead>{t('stocktake.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stocktakes || []).slice(0, 20).map((st: any) => (
                  <TableRow key={st.id}>
                    <TableCell>{st.locationName || st.locationId}</TableCell>
                    <TableCell>{st.status || 'applied'}</TableCell>
                  </TableRow>
                ))}
                {(stocktakes || []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">{t('stocktake.noStocktakes')}</TableCell>
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
