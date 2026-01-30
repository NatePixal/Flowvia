
"use client"

import { useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Legend, Tooltip, ComposedChart, Line, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { DailyExpense, Sale, Currency } from '@/lib/types';
import { ChartTooltipContent, ChartContainer, ChartConfig } from '@/components/ui/chart';
import { useFirebase } from '@/firebase/provider';
import { Skeleton } from '@/components/ui/skeleton';
import { Timestamp } from 'firebase/firestore';
import { formatMoneyMinor, convertMinorToBase } from '@/lib/money';
import { format, startOfDay } from 'date-fns';
import { FancyCard } from '@/components/ui/fancy-card';

const KpiRow = ({ label, value, isLoading }: { label: string; value: React.ReactNode, isLoading?: boolean }) => (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background/10 px-3 py-2 min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        {isLoading ? <Skeleton className="h-5 w-20" /> : <div className="text-sm font-semibold tabular-nums whitespace-nowrap">{value}</div>}
    </div>
);

const FinancialOverview = memo(function FinancialOverview() {
  const { t } = useTranslation();
  const { companyBaseCurrency } = useFirebase();
  const reportCurrency = companyBaseCurrency || 'USD';

  const { data: expenses, loading: expensesLoading } = useCompanyCollection<DailyExpense>('dailyExpenses');
  const { data: sales, loading: salesLoading } = useCompanyCollection<Sale>('sales');
  const isLoading = expensesLoading || salesLoading;

  const profitAndExpenseData = useMemo(() => {
    const dataMap = new Map<string, { date: string; profit: number; expenses: number }>();

    (sales || []).forEach(sale => {
      const date = sale.date instanceof Timestamp
        ? format(startOfDay(sale.date.toDate()), 'yyyy-MM-dd')
        : format(startOfDay(new Date(sale.date as any)), 'yyyy-MM-dd');

      const profitBase = sale.grossProfitBaseMinor ?? 0;

      if (!dataMap.has(date)) dataMap.set(date, { date, profit: 0, expenses: 0 });
      dataMap.get(date)!.profit += profitBase;
    });

    (expenses || []).forEach(expense => {
      const date = expense.date instanceof Timestamp
        ? format(startOfDay(expense.date.toDate()), 'yyyy-MM-dd')
        : format(startOfDay(new Date(expense.date as any)), 'yyyy-MM-dd');

      const expenseBase = expense.amountBaseMinor ?? 0;

      if (!dataMap.has(date)) dataMap.set(date, { date, profit: 0, expenses: 0 });
      dataMap.get(date)!.expenses += expenseBase;
    });

    const sortedData = Array.from(dataMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sortedData.map(d => ({
      ...d,
      date: format(new Date(d.date), 'MMM d'), // Format for display
      profit: d.profit,
      expenses: d.expenses,
    }));
  }, [sales, expenses]);

  const expenseCategories = useMemo(() => {
    const categoryMap = new Map<string, number>();
    (expenses || [])
      .forEach(expense => {
        const expenseBase = expense.amountBaseMinor ?? 0;
        const key = expense.expenseType;
        categoryMap.set(key, (categoryMap.get(key) || 0) + expenseBase);
      });

    return Array.from(categoryMap.entries()).map(([name, value]) => ({
      name,
      value,
      translatedName: t(`expenses.${name.toLowerCase()}`),
      fill: `var(--color-${name})`
    }));
  }, [expenses, t]);

  const { totalRevenue, totalGrossProfit, totalNetIncome } = useMemo(() => {
    let totalRevenue = 0;
    let totalGrossProfit = 0;
    let totalExpenses = 0;

    (sales || []).forEach(sale => {
        totalRevenue += sale.revenueBaseMinor ?? 0;
        totalGrossProfit += sale.grossProfitBaseMinor ?? 0;
    });

    (expenses || []).forEach(expense => {
        totalExpenses += expense.amountBaseMinor ?? 0;
    });

    const totalNetIncome = totalGrossProfit - totalExpenses;

    return { totalRevenue, totalGrossProfit, totalNetIncome };
  }, [sales, expenses]);

  const EXPENSE_CHART_CONFIG: ChartConfig = {
    salary: { label: t("expenses.salary"), color: "hsl(var(--chart-1))" },
    rent: { label: t("expenses.rent"), color: "hsl(var(--chart-2))" },
    utilities: { label: t("expenses.utilities"), color: "hsl(var(--chart-3))" },
    marketing: { label: t("expenses.marketing"), color: "hsl(var(--chart-4))" },
    food: { label: t("expenses.food"), color: "hsl(var(--chart-5))" },
    transport: { label: t("expenses.transport"), color: "hsl(var(--chart-1))" },
    others: { label: t("expenses.others"), color: "hsl(var(--muted))" },
  };

  return (
    <FancyCard className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>{t('dashboard.financialOverview')}</CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-6 min-w-0">
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {t('dashboard.profitAndExpense')} ({reportCurrency})
          </p>

          <div className="h-[100px] w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ChartContainer
                config={{
                  expenses: { label: t('dashboard.expenses'), color: 'hsl(var(--chart-4))' },
                  profit: { label: t('dashboard.profit'), color: 'hsl(var(--primary))' },
                }}
                className="h-full w-full"
              >
                <ComposedChart data={profitAndExpenseData}>
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        formatter={(value) => formatMoneyMinor(value as number, reportCurrency)}
                      />
                    }
                  />
                  <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="expenses" stroke="var(--color-expenses)" dot={false} strokeWidth={2} />
                </ComposedChart>
              </ChartContainer>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {t('dashboard.expenseCategories')} ({reportCurrency})
          </p>

          <div className="h-[150px] w-full">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ChartContainer config={EXPENSE_CHART_CONFIG} className="h-full w-full">
                <PieChart>
                  <Tooltip
                    content={
                      <ChartTooltipContent
                        indicator="dot"
                        formatter={(value) => formatMoneyMinor(value as number, reportCurrency)}
                        nameKey="translatedName"
                      />
                    }
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="square"
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value, entry) => {
                      const p = entry.payload as unknown as { translatedName?: string };
                      return <span className="text-muted-foreground capitalize">{p?.translatedName}</span>;
                    }}
                  />
                  <Pie
                    data={expenseCategories}
                    dataKey="value"
                    nameKey="translatedName"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={60}
                    paddingAngle={2}
                    labelLine={false}
                    label={false}
                  >
                    {expenseCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </div>
        </div>

        <div className="mt-auto pt-4 space-y-2">
            <KpiRow label={t("dashboard.revenue")} value={formatMoneyMinor(totalRevenue, reportCurrency)} isLoading={isLoading} />
            <KpiRow label={t("dashboard.grossProfit")} value={formatMoneyMinor(totalGrossProfit, reportCurrency)} isLoading={isLoading} />
            <KpiRow label={t("dashboard.netIncome")} value={formatMoneyMinor(totalNetIncome, reportCurrency)} isLoading={isLoading} />
        </div>
      </CardContent>
    </FancyCard>
  );
});

export default FinancialOverview;
