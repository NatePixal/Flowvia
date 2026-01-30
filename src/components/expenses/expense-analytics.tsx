
'use client';
import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Tag, TrendingUp, CalendarDays, BarChart2, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DailyExpense, Currency } from '@/lib/types';
import { useCurrency } from '@/lib/currency-provider';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartTooltipContent, ChartContainer } from '@/components/ui/chart';
import { subDays, format, startOfDay, isValid } from 'date-fns';
import { Timestamp, type FieldValue } from 'firebase/firestore';
import { formatMoneyMinor, toMinor } from '@/lib/money';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface ExpenseAnalyticsProps {
    expenses: DailyExpense[];
}

type DateInput = string | Timestamp | Date | FieldValue | null | undefined;

const safeGetDate = (date: DateInput): Date | null => {
  if (!date) return null;

  if (date instanceof Date && isValid(date)) return date;
  if (date instanceof Timestamp) return date.toDate();

  if (typeof date === 'string') {
    const parsedDate = new Date(date);
    return isValid(parsedDate) ? parsedDate : null;
  }

  // FieldValue sentinel (serverTimestamp) -> not a real date yet
  return null;
};


const StatCard = ({ title, value, icon: Icon, isLoading }: { title: string; value: React.ReactNode; icon: React.ElementType; isLoading?: boolean;}) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <div className="h-8 w-24 animate-pulse rounded-md bg-muted"></div> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
);

const CATEGORY_COLORS: Record<string, string> = {
    others: '#64748B',
    salary: '#1E5EFF',
    utilities: '#0EA5A5',
    food: '#F59E0B',
    transport: '#6366F1',
    rent: '#38BDF8',
    marketing: '#E11D48',
};

export default function ExpenseAnalytics({ expenses }: ExpenseAnalyticsProps) {
    const { t } = useTranslation();
    const { baseCurrency, currency: displayCurrency } = useCurrency();
    
    // --- State for Chart Currency ---
    const availableCurrencies = useMemo(() => Array.from(new Set(expenses.map(e => e.currency))), [expenses]);
    const [chartCurrency, setChartCurrency] = useState<Currency>(displayCurrency);

    useEffect(() => {
        const defaultChartCurrency = availableCurrencies.includes(displayCurrency) 
          ? displayCurrency 
          : availableCurrencies[0] || displayCurrency;
        setChartCurrency(defaultChartCurrency);
    }, [expenses, displayCurrency, availableCurrencies]);

    const { totalMinorByCurrency, avgDailyMinorByCurrency, highestCategory } = useMemo(() => {
        if (!expenses || expenses.length === 0) {
            return { totalMinorByCurrency: {}, avgDailyMinorByCurrency: {}, highestCategory: 'N/A' };
        }
        
        const totalMinorByCurrency: Record<string, number> = {};
        const dailyTotals: Record<Currency, Record<string, number>> = { USD: {}, AED: {}, UZS: {}, CNY: {} };
        const categoryTotalsMinor: Record<string, number> = {};

        expenses.forEach(expense => {
            const minorAmount = toMinor(expense.amount, expense.currency);
            totalMinorByCurrency[expense.currency] = (totalMinorByCurrency[expense.currency] || 0) + minorAmount;

            const expenseDate = safeGetDate(expense.date);
            if (expenseDate) {
              const dateStr = format(expenseDate, 'yyyy-MM-dd');
              dailyTotals[expense.currency][dateStr] = (dailyTotals[expense.currency][dateStr] || 0) + minorAmount;
            }
            
            // Highest category is now tied to the selected chart currency for consistency
            if (expense.currency === chartCurrency) {
              categoryTotalsMinor[expense.expenseType] = (categoryTotalsMinor[expense.expenseType] || 0) + minorAmount;
            }
        });

        const avgDailyMinorByCurrency: Record<string, number> = {};
        for (const currency in dailyTotals) {
            const numDaysForCurrency = Object.keys(dailyTotals[currency as Currency]).length;
            if (numDaysForCurrency > 0) {
                avgDailyMinorByCurrency[currency as Currency] = totalMinorByCurrency[currency as Currency] / numDaysForCurrency;
            }
        }
        
        const highestCatEntry = Object.entries(categoryTotalsMinor).sort(([,a],[,b]) => b-a)[0];

        return {
            totalMinorByCurrency,
            avgDailyMinorByCurrency,
            highestCategory: highestCatEntry ? t(`expenses.${highestCatEntry[0].toLowerCase()}`) : t('expenses.notApplicableForCurrency'),
        };
    }, [expenses, t, chartCurrency]);

    const expenseDistribution = useMemo(() => {
        const categoryTotals: { [key: string]: number } = {};
        expenses
            .filter(e => e.currency === chartCurrency)
            .forEach(expense => {
                const minorAmount = toMinor(expense.amount, expense.currency);
                categoryTotals[expense.expenseType] = (categoryTotals[expense.expenseType] || 0) + minorAmount;
            });
        return Object.entries(categoryTotals)
          .map(([name, value]) => ({ name, value, translatedName: t(`expenses.${name.toLowerCase()}`) }))
          .sort((a, b) => b.value - a.value);
    }, [expenses, t, chartCurrency]);
    
    const expensesByDay = useMemo(() => {
        const last7DaysMap = new Map<string, { date: string; expenses: number }>();
        for (let i = 6; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const dateStr = format(d, 'EEE');
            last7DaysMap.set(format(d, 'yyyy-MM-dd'), { date: dateStr, expenses: 0 });
        }
    
        expenses
            .filter(e => e.currency === chartCurrency)
            .forEach((expense) => {
                const expenseDate = safeGetDate(expense.date);
                if (expenseDate) {
                  const dateStr = format(startOfDay(expenseDate), 'yyyy-MM-dd');
                  if (last7DaysMap.has(dateStr)) {
                      const dayRecord = last7DaysMap.get(dateStr)!;
                      const minorAmount = toMinor(expense.amount, expense.currency);
                      dayRecord.expenses += minorAmount;
                  }
                }
            });
    
        return Array.from(last7DaysMap.values());
    }, [expenses, chartCurrency]);


    const totalExpensesDisplay = useMemo(() => {
      const entries = Object.entries(totalMinorByCurrency);
      if (entries.length === 0) return formatMoneyMinor(0, baseCurrency);
      return entries.map(([currency, amount]) => (
        <div key={currency}>{formatMoneyMinor(amount, currency as Currency)}</div>
      ));
    }, [totalMinorByCurrency, baseCurrency]);

    const avgDailyDisplay = useMemo(() => {
      const entries = Object.entries(avgDailyMinorByCurrency);
      if (entries.length === 0) return formatMoneyMinor(0, baseCurrency);
      return entries.map(([currency, amount]) => (
        <div key={currency}>{formatMoneyMinor(amount, currency as Currency)}</div>
      ));
    }, [avgDailyMinorByCurrency, baseCurrency]);
    
    const hasAnyExpenses = useMemo(() => Object.keys(totalMinorByCurrency).length > 0, [totalMinorByCurrency]);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title={t('expenses.totalExpenses')}
                    value={hasAnyExpenses ? <div className="text-lg">{totalExpensesDisplay}</div> : formatMoneyMinor(0, baseCurrency)}
                    icon={DollarSign}
                />
                <StatCard 
                    title={`${t('expenses.highestExpenseCategory')} (${chartCurrency})`}
                    value={highestCategory}
                    icon={Tag}
                />
                <StatCard 
                    title={t('expenses.averageDailyExpense')}
                    value={hasAnyExpenses ? <div className="text-lg">{avgDailyDisplay}</div> : formatMoneyMinor(0, baseCurrency)}
                    icon={CalendarDays}
                />
                <StatCard 
                    title={t('expenses.salaryVsNonSalary')}
                    value={"N/A"} // Placeholder
                    icon={TrendingUp}
                />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>{`${t('expenses.expenseDistribution')} (${chartCurrency})`}</CardTitle>
                             <div className="w-[150px]">
                                <Label className="text-xs text-muted-foreground">{t('expenses.chartsCurrency')}</Label>
                                <Select value={chartCurrency} onValueChange={(v) => setChartCurrency(v as Currency)} disabled={availableCurrencies.length === 0}>
                                    <SelectTrigger className="h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCurrencies.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                       {expenseDistribution.length > 0 ? (
                            <ChartContainer config={{}} className="h-[250px] w-full">
                                <PieChart>
                                    <Pie 
                                        data={expenseDistribution} 
                                        dataKey="value" 
                                        nameKey="translatedName" 
                                        cx="50%" 
                                        cy="50%" 
                                        outerRadius={80} 
                                        label
                                    >
                                        {expenseDistribution.map((entry) => (
                                            <Cell 
                                                key={`cell-${entry.name}`} 
                                                fill={CATEGORY_COLORS[entry.name as keyof typeof CATEGORY_COLORS] || '#6B7280'} 
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        content={<ChartTooltipContent 
                                            formatter={(value) => formatMoneyMinor(value as number, chartCurrency)} 
                                            nameKey="translatedName"
                                        />} 
                                    />
                                    <Legend formatter={(value) => t(value)} />
                                </PieChart>
                            </ChartContainer>
                       ) : (
                            <div className="h-[250px] flex flex-col items-center justify-center text-center text-muted-foreground">
                                <PieChartIcon className="h-10 w-10 mb-2" />
                                <p>{t('expenses.noExpensesRecordedIn', { currency: chartCurrency })}</p>
                            </div>
                       )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                    <CardHeader>
                         <div className="flex justify-between items-center">
                            <CardTitle>{`${t('expenses.expenseTrend')} (${chartCurrency})`}</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent>
                       {expensesByDay.some(d => d.expenses > 0) ? (
                            <ChartContainer config={{ expenses: { label: t('expenses.pageTitle'), color: "#28c9c9" } }} className="h-[250px] w-full">
                                <BarChart data={expensesByDay}>
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis tickFormatter={(value) => formatMoneyMinor(value as number, chartCurrency).replace(/(\.00|,[00])$/, '')} />
                                    <Tooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => formatMoneyMinor(value as number, chartCurrency)} />} />
                                    <Bar dataKey="expenses" fill="var(--color-expenses)" radius={8} />
                                </BarChart>
                            </ChartContainer>
                       ) : (
                            <div className="h-[250px] flex flex-col items-center justify-center text-center text-muted-foreground">
                                <BarChart2 className="h-10 w-10 mb-2" />
                                <p>{t('expenses.noExpensesRecordedIn', { currency: chartCurrency })}</p>
                            </div>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
