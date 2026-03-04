'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase';
import { hasPermission } from '@/lib/permissions';
import type { Sale, DailyExpense } from '@/lib/types';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { FancyCard } from '@/components/ui/fancy-card';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { exportToXlsx } from '@/lib/export/xlsx-export';
import { format } from 'date-fns';
import { Timestamp, FieldValue } from 'firebase/firestore';

const safeGetDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value && typeof value.toDate === 'function') {
    try {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }
  return null;
};

export default function ExportsPage() {
  const { t } = useTranslation();
  const { companyId, userProfile, companyBaseCurrency } = useFirebase();

  const canView = hasPermission(userProfile, 'exports', 'view');
  const canExport = hasPermission(userProfile, 'exports', 'export');

  const { data: sales } = useCompanyCollection<Sale>('sales');
  const { data: expenses } = useCompanyCollection<DailyExpense>('dailyExpenses');

  const baseCurrency = companyBaseCurrency || 'USD';

  const exportSales1C = () => {
    if (!companyId) return;
    exportToXlsx(
      `1c_sales_${companyId}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
      '1C Sales (Template)',
      (sales || []).filter(s => !s.isDeleted),
      [
        { header: 'Date', value: r => {
          const d = safeGetDate((r as any).date);
          return d ? format(d, 'yyyy-MM-dd') : '';
        }},
        { header: 'Receipt', value: r => (r as any).receiptNumber || r.id },
        { header: 'Location', value: r => (r as any).locationName || (r as any).locationId || '' },
        { header: 'Client', value: r => (r as any).clientName || '' },
        { header: 'Currency', value: r => (r as any).salePriceCurrency || '' },
        { header: 'SubtotalMinor', value: r => (r as any).revenueMinor ?? '' },
        { header: 'DiscountMinor', value: r => (r as any).discountMinor ?? 0 },
        { header: 'VATMinor', value: r => (r as any).vatMinor ?? 0 },
        { header: 'TotalMinor', value: r => (r as any).totalMinor ?? (r as any).revenueMinor ?? 0 },
        { header: 'BaseCurrency', value: r => (r as any).baseCurrency || baseCurrency },
        { header: 'TotalBaseMinor', value: r => (r as any).totalBaseMinor ?? (r as any).revenueBaseMinor ?? 0 },
        { header: 'COGSBaseMinor', value: r => (r as any).costOfGoodsSoldBaseMinor ?? 0 },
        { header: 'GrossProfitBaseMinor', value: r => (r as any).grossProfitBaseMinor ?? 0 },
        { header: 'Items', value: r => {
          const items = (r as any).items;
          if (!Array.isArray(items)) return `${(r as any).quantity || ''} x ${(r as any).productCode || ''}`;
          return items.map((i: any) => `${i.quantity}x${i.productCode}`).join(', ');
        }},
      ]
    );
  };

  const exportExpenses1C = () => {
    if (!companyId) return;
    exportToXlsx(
      `1c_expenses_${companyId}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
      '1C Expenses (Template)',
      (expenses || []),
      [
        { header: 'Date', value: r => {
          const d = safeGetDate((r as any).date);
          return d ? format(d, 'yyyy-MM-dd') : '';
        }},
        { header: 'Category', value: r => (r as any).expenseType || '' },
        { header: 'Location', value: r => (r as any).locationName || (r as any).locationId || '' },
        { header: 'Currency', value: r => (r as any).currency || '' },
        { header: 'AmountMinor', value: r => (r as any).amountMinor ?? '' },
        { header: 'BaseCurrency', value: r => (r as any).baseCurrency || baseCurrency },
        { header: 'AmountBaseMinor', value: r => (r as any).amountBaseMinor ?? '' },
        { header: 'Description', value: r => (r as any).description || '' },
      ]
    );
  };

  if (!canView) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t('exports.title')}</h1>
        <p className="text-muted-foreground">{t('toast.error.accessDenied')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('exports.title')}</h1>
        <p className="text-muted-foreground">{t('exports.desc')}</p>
      </div>

      <FancyCard>
        <CardHeader>
          <CardTitle>{t('exports.templatesTitle')}</CardTitle>
          <CardDescription>{t('exports.templatesDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={exportSales1C} disabled={!canExport}>{t('exports.exportSales1C')}</Button>
          <Button onClick={exportExpenses1C} disabled={!canExport} variant="outline">{t('exports.exportExpenses1C')}</Button>
          <div className="text-xs text-muted-foreground">
            {t('exports.hint1c')}
          </div>
        </CardContent>
      </FancyCard>
    </div>
  );
}
