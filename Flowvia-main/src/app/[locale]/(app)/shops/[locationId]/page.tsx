'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Location, Sale, DailyExpense, Product } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoneyMinor } from '@/lib/money';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { format } from 'date-fns';

type DateInput = string | Date | Timestamp | FieldValue | null | undefined;
const safeGetDate = (value: DateInput): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  // @ts-ignore
  if (value?.toDate) return value.toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

export default function ShopDetailPage({ params }: { params: { locationId: string } }) {
  const { t } = useTranslation();
  const { companyBaseCurrency, userProfile, locationsEnabled } = useFirebase();
  const canView = hasPermission(userProfile, 'shops', 'view');

  const locationId = params.locationId;

  const { data: locations } = useCompanyCollection<Location>('locations');
  const { data: sales } = useCompanyCollection<Sale>('sales');
  const { data: expenses } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const { data: products } = useCompanyCollection<Product>('products');

  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const baseCurrency = companyBaseCurrency || 'USD';

  const location = useMemo(() => (locations || []).find((l) => l.id === locationId) || null, [locations, locationId]);

  const filteredSales = useMemo(() => {
    const list = (sales || []).filter((s) => !s.isDeleted && (s as any).locationId === locationId);
    if (!dateRange?.from) return list;
    const from = dateRange.from;
    const to = dateRange.to || from;
    const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    return list.filter((s) => {
      const d = safeGetDate((s as any).date);
      return d && d >= from && d <= toEnd;
    });
  }, [sales, locationId, dateRange]);

  const filteredExpenses = useMemo(() => {
    const list = (expenses || []).filter((e) => (e as any).locationId === locationId);
    if (!dateRange?.from) return list;
    const from = dateRange.from;
    const to = dateRange.to || from;
    const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    return list.filter((e) => {
      const d = safeGetDate((e as any).date);
      return d && d >= from && d <= toEnd;
    });
  }, [expenses, locationId, dateRange]);

  const summary = useMemo(() => {
    let revenue = 0, cogs = 0;
    for (const s of filteredSales) {
      revenue += Number((s as any).revenueBaseMinor ?? 0);
      cogs += Number((s as any).costOfGoodsSoldBaseMinor ?? 0);
    }
    let exp = 0;
    for (const e of filteredExpenses) {
      exp += Number((e as any).amountBaseMinor ?? 0);
    }
    return {
      revenueBaseMinor: revenue,
      cogsBaseMinor: cogs,
      grossProfitBaseMinor: revenue - cogs,
      expensesBaseMinor: exp,
      netProfitBaseMinor: (revenue - cogs) - exp,
    };
  }, [filteredSales, filteredExpenses]);

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('shops.shop')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  if (!locationsEnabled) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('shops.shop')}</h1>
        <p className="text-muted-foreground">{t('shops.enableFirst')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{location?.name || t('shops.shop')}</h1>
        <p className="text-muted-foreground">{t('shops.shopDesc')}</p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {dateRange?.from ? (
            <span>
              {t('shops.period')}: {format(dateRange.from, 'yyyy-MM-dd')} — {format(dateRange.to || dateRange.from, 'yyyy-MM-dd')}
            </span>
          ) : (
            <span>{t('shops.allTime')}</span>
          )}
        </div>
        <DateRangePicker date={dateRange} setDate={setDateRange} />
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('shops.pnlTitle')}</CardTitle>
          <CardDescription>{t('shops.pnlDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t('shops.revenue')}</div>
              <div className="text-lg font-semibold">{formatMoneyMinor(summary.revenueBaseMinor, baseCurrency as any)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t('shops.cogs')}</div>
              <div className="text-lg font-semibold">{formatMoneyMinor(summary.cogsBaseMinor, baseCurrency as any)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t('shops.grossProfit')}</div>
              <div className="text-lg font-semibold">{formatMoneyMinor(summary.grossProfitBaseMinor, baseCurrency as any)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t('shops.expenses')}</div>
              <div className="text-lg font-semibold">{formatMoneyMinor(summary.expensesBaseMinor, baseCurrency as any)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{t('shops.netProfit')}</div>
              <div className="text-lg font-semibold">{formatMoneyMinor(summary.netProfitBaseMinor, baseCurrency as any)}</div>
            </div>
          </div>
        </CardContent>
      </FancyCard>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('shops.expenses')} ({t('shops.byCategory')})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('expenses.category')}</TableHead>
                  <TableHead>{t('expenses.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(
                  filteredExpenses.reduce((acc: any, e: any) => {
                    const key = e.expenseType || 'others';
                    acc[key] = (acc[key] || 0) + Number(e.amountBaseMinor ?? 0);
                    return acc;
                  }, {})
                ).map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell>{t(`expenses.${k}`)}</TableCell>
                    <TableCell>{formatMoneyMinor(Number(v), baseCurrency as any)}</TableCell>
                  </TableRow>
                ))}
                {filteredExpenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">{t('shops.noExpenses')}</TableCell>
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
