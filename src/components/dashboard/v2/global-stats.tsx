'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { Banknote, Boxes, Landmark, Receipt, Scale, ShoppingCart, TrendingUp, WalletCards } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDoc, useFirebase } from '@/firebase';
import { computeCompanyAnalytics } from '@/lib/flowvia-functions';
import { formatMoneyMinor } from '@/lib/money';
import type { Currency } from '@/lib/types';
import LuxuryMetricCard from './LuxuryMetricCard';

type AnalyticsSnapshot = {
  baseCurrency?: Currency;
  totalRevenueMinor?: number;
  totalExpensesMinor?: number;
  grossProfitMinor?: number;
  netProfitMinor?: number;
  vatCollectedMinor?: number;
  vatPaidMinor?: number;
  vatPayableMinor?: number;
  inventoryValueMinor?: number;
  lowStockCount?: number;
  totalClientDebtByCurrency?: Record<string, number>;
  totalSupplierDebtByCurrency?: Record<string, number>;
  salesCount?: number;
  unpaidSalesCount?: number;
  paidSalesCount?: number;
  partialSalesCount?: number;
  auditStatus?: 'verified' | 'needs_audit' | 'repair_required' | 'unknown';
};

function money(value: number | undefined, currency: Currency) {
  return formatMoneyMinor(Number(value ?? 0), currency);
}

function sumCurrencyMap(values: Record<string, number> | undefined, currency: Currency) {
  if (!values) return 0;
  return Number(values[currency] ?? 0);
}

const GlobalStats = memo(function GlobalStats() {
  const { t } = useTranslation();
  const { firestore, companyId, companyBaseCurrency } = useFirebase();
  const [refreshing, setRefreshing] = useState(false);
  const analyticsRef = useMemo(
    () => (firestore && companyId ? doc(firestore, 'companies', companyId, 'analytics', 'current') : null),
    [firestore, companyId]
  );
  const { data: analytics, isLoading } = useDoc<AnalyticsSnapshot>(analyticsRef);
  const reportCurrency = analytics?.baseCurrency || companyBaseCurrency || 'USD';
  const auditStatus = analytics?.auditStatus === 'unknown' ? 'neutral' : analytics?.auditStatus || 'neutral';

  useEffect(() => {
    if (!companyId || analytics || refreshing) return;
    setRefreshing(true);
    computeCompanyAnalytics({ companyId })
      .catch((error) => console.error('Failed to compute company analytics:', error))
      .finally(() => setRefreshing(false));
  }, [analytics, companyId, refreshing]);

  const cards = [
    {
      title: t('dashboard.revenue'),
      value: money(analytics?.totalRevenueMinor, reportCurrency),
      icon: TrendingUp,
      description: 'Recognized revenue',
      status: auditStatus,
    },
    {
      title: t('dashboard.totalExpenses'),
      value: money(analytics?.totalExpensesMinor, reportCurrency),
      icon: WalletCards,
      description: 'Operating outflow',
      status: auditStatus,
    },
    {
      title: t('dashboard.grossProfit'),
      value: money(analytics?.grossProfitMinor, reportCurrency),
      icon: Landmark,
      description: 'Revenue less COGS',
      status: auditStatus,
    },
    {
      title: t('dashboard.netProfit'),
      value: money(analytics?.netProfitMinor, reportCurrency),
      icon: Banknote,
      description: 'Profit after expenses',
      status: auditStatus,
    },
    {
      title: 'VAT payable',
      value: money(analytics?.vatPayableMinor, reportCurrency),
      icon: Receipt,
      description: `Collected ${money(analytics?.vatCollectedMinor, reportCurrency)} / paid ${money(analytics?.vatPaidMinor, reportCurrency)}`,
      status: auditStatus,
    },
    {
      title: 'Inventory value',
      value: money(analytics?.inventoryValueMinor, reportCurrency),
      icon: Boxes,
      description: `${Number(analytics?.lowStockCount ?? 0).toLocaleString()} low-stock products`,
      status: auditStatus,
    },
    {
      title: 'Client debt',
      value: money(sumCurrencyMap(analytics?.totalClientDebtByCurrency, reportCurrency), reportCurrency),
      icon: Scale,
      description: `${Number(analytics?.unpaidSalesCount ?? 0).toLocaleString()} unpaid sales`,
      status: auditStatus,
    },
    {
      title: t('dashboard.totalOrders'),
      value: Number(analytics?.salesCount ?? 0).toLocaleString(),
      icon: ShoppingCart,
      description: `${Number(analytics?.paidSalesCount ?? 0).toLocaleString()} paid / ${Number(analytics?.partialSalesCount ?? 0).toLocaleString()} partial`,
      status: auditStatus,
    },
  ] as const;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('dashboard.globalStats')}</h2>
          <p className="text-sm text-muted-foreground">Reporting currency: {reportCurrency}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <LuxuryMetricCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            description={card.description}
            isLoading={isLoading || refreshing}
            status={card.status}
          />
        ))}
      </div>
    </section>
  );
});

export default GlobalStats;
