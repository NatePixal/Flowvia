
'use client';

import { useMemo, memo } from 'react';
import { CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { FancyCard } from '@/components/ui/fancy-card';
import { ShoppingCart, Banknote, Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Sale, DailyExpense } from '@/lib/types';
import { useFirebase } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoneyMinor } from '@/lib/money';

const StatCard = ({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  isLoading: boolean;
}) => (
  <FancyCard>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      <Icon className="h-4 w-4 text-primary" />
    </CardHeader>
    <CardContent>
      {isLoading ? <Skeleton className="h-8 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
    </CardContent>
  </FancyCard>
);

const GlobalStats = memo(function GlobalStats() {
  const { t } = useTranslation();
  const { companyBaseCurrency } = useFirebase();
  const reportCurrency = companyBaseCurrency || 'USD';

  const { data: sales, loading: salesLoading } = useCompanyCollection<Sale>('sales');
  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const isLoading = salesLoading || expensesLoading;

  const { totalOrders, totalExpenses, totalNetProfit } = useMemo(() => {
    const totalOrders = sales?.length ?? 0;

    const totalGrossProfit = (sales || []).reduce(
      (sum, sale) => sum + (sale.grossProfitBaseMinor ?? 0),
      0
    );

    const totalExpenses = (expenses || []).reduce(
      (sum, expense) => sum + (expense.amountBaseMinor ?? 0),
      0
    );

    // Net Profit is Gross Profit minus operating expenses.
    const totalNetProfit = totalGrossProfit - totalExpenses;

    return { totalOrders, totalExpenses, totalNetProfit };
  }, [sales, expenses]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">{t('dashboard.globalStats')}</h2>
      <div className="grid gap-6 md:grid-cols-3">
        <StatCard
          title={t('dashboard.totalOrders')}
          value={isLoading ? '...' : totalOrders.toLocaleString()}
          icon={ShoppingCart}
          isLoading={isLoading}
        />
        <StatCard
          title={t('dashboard.totalExpenses')}
          value={isLoading ? '...' : formatMoneyMinor(totalExpenses, reportCurrency)}
          icon={Banknote}
          isLoading={isLoading}
        />
        <StatCard
          title={t('dashboard.netProfit')}
          value={isLoading ? '...' : formatMoneyMinor(totalNetProfit, reportCurrency)}
          icon={Landmark}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
});

export default GlobalStats;
