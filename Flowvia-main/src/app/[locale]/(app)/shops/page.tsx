'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Location, Sale, DailyExpense } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function ShopsOverviewPage() {
  const { t } = useTranslation();
  const { companyId, userProfile, locationsEnabled, companyBaseCurrency } = useFirebase();
  const pathname = usePathname();
  const locale = pathname.split('/')[1] || 'en';

  const canView = hasPermission(userProfile, 'shops', 'view');

  const { data: locations } = useCompanyCollection<Location>('locations');
  const { data: sales } = useCompanyCollection<Sale>('sales');
  const { data: expenses } = useCompanyCollection<DailyExpense>('dailyExpenses');

  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const baseCurrency = companyBaseCurrency || 'USD';

  const filteredSales = useMemo(() => {
    const list = (sales || []).filter((s) => !s.isDeleted);
    if (!dateRange?.from) return list;
    const from = dateRange.from;
    const to = dateRange.to || from;
    const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    return list.filter((s) => {
      const d = safeGetDate((s as any).date);
      return d && d >= from && d <= toEnd;
    });
  }, [sales, dateRange]);

  const filteredExpenses = useMemo(() => {
    const list = (expenses || []);
    if (!dateRange?.from) return list;
    const from = dateRange.from;
    const to = dateRange.to || from;
    const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
    return list.filter((e) => {
      const d = safeGetDate((e as any).date);
      return d && d >= from && d <= toEnd;
    });
  }, [expenses, dateRange]);

  const rows = useMemo(() => {
    const byLoc: Record<string, any> = {};

    for (const loc of (locations || [])) {
      byLoc[loc.id] = {
        id: loc.id,
        name: loc.name,
        revenueBaseMinor: 0,
        cogsBaseMinor: 0,
        grossProfitBaseMinor: 0,
        expensesBaseMinor: 0,
        netProfitBaseMinor: 0,
      };
    }

    for (const s of filteredSales) {
      const locId = (s as any).locationId;
      if (!locId || !byLoc[locId]) continue;
      const revenue = Number((s as any).revenueBaseMinor ?? 0);
      const cogs = Number((s as any).costOfGoodsSoldBaseMinor ?? 0);
      byLoc[locId].revenueBaseMinor += revenue;
      byLoc[locId].cogsBaseMinor += cogs;
      byLoc[locId].grossProfitBaseMinor += (revenue - cogs);
    }

    for (const e of filteredExpenses) {
      const locId = (e as any).locationId;
      if (!locId || !byLoc[locId]) continue;
      byLoc[locId].expensesBaseMinor += Number((e as any).amountBaseMinor ?? 0);
    }

    for (const k of Object.keys(byLoc)) {
      byLoc[k].netProfitBaseMinor = byLoc[k].grossProfitBaseMinor - byLoc[k].expensesBaseMinor;
    }

    return Object.values(byLoc).sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [locations, filteredSales, filteredExpenses]);

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('shops.title')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  if (!locationsEnabled) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('shops.title')}</h1>
        <p className="text-muted-foreground">{t('shops.enableFirst')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('shops.title')}</h1>
        <p className="text-muted-foreground">{t('shops.desc')}</p>
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
          <CardTitle>{t('shops.tableTitle')}</CardTitle>
          <CardDescription>{t('shops.tableDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('shops.shop')}</TableHead>
                  <TableHead>{t('shops.revenue')}</TableHead>
                  <TableHead>{t('shops.cogs')}</TableHead>
                  <TableHead>{t('shops.grossProfit')}</TableHead>
                  <TableHead>{t('shops.expenses')}</TableHead>
                  <TableHead>{t('shops.netProfit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link className="underline" href={`/${locale}/shops/${r.id}`}>{r.name}</Link>
                    </TableCell>
                    <TableCell>{formatMoneyMinor(r.revenueBaseMinor, baseCurrency as any)}</TableCell>
                    <TableCell>{formatMoneyMinor(r.cogsBaseMinor, baseCurrency as any)}</TableCell>
                    <TableCell>{formatMoneyMinor(r.grossProfitBaseMinor, baseCurrency as any)}</TableCell>
                    <TableCell>{formatMoneyMinor(r.expensesBaseMinor, baseCurrency as any)}</TableCell>
                    <TableCell>{formatMoneyMinor(r.netProfitBaseMinor, baseCurrency as any)}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">{t('shops.noData')}</TableCell>
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
