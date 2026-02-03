'use client';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Tag, TrendingUp, CalendarDays, BarChart2, PieChart as PieChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DailyExpense, Currency } from '@/lib/types';
import { useCurrency } from '@/lib/currency-provider';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts';
import { ChartTooltipContent, ChartContainer } from '@/components/ui/chart';
import { subDays, format, startOfDay, isValid } from 'date-fns';
import { Timestamp, type FieldValue } from 'firebase/firestore';
import { formatMoneyMinor } from '@/lib/money';

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
    const { baseCurrency } = useCurrency();
    
    const { totalExpenses, avgDailyExpense, highestCategory } = useMemo(() => {
        if (!expenses || expenses.length === 0) {
            return { totalExpenses: 0, avgDailyExpense: 0, highestCategory: 'N/A' };
        }
        
        let totalBaseMinor = 0;
        const dailyTotals: Record<string, number> = {};
        const categoryTotals: Record<string, number> = {};

        expenses.forEach(expense => {
            const amountBaseMinor = expense.amountBaseMinor || 0;
            totalBaseMinor += amountBaseMinor;

            const expenseDate = safeGetDate(expense.date);
            if (expenseDate) {
              const dateStr = format(expenseDate, 'yyyy-MM-dd');
              dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + amountBaseMinor;
            }
            
            categoryTotals[expense.expenseType] = (categoryTotals[expense.expenseType] || 0) + amountBaseMinor;
        });

        const numDays = Object.keys(dailyTotals).length;
        const avgDaily = numDays > 0 ? totalBaseMinor / numDays : 0;
        
        const highestCatEntry = Object.entries(categoryTotals).sort(([,a],[,b]) => b-a)[0];

        return {
            totalExpenses: totalBaseMinor,
            avgDailyExpense: avgDaily,
            highestCategory: highestCatEntry ? t(`expenses.${highestCatEntry[0].toLowerCase()}`) : 'N/A',
        };
    }, [expenses, t]);

    const expenseDistribution = useMemo(() => {
        const categoryTotals: { [key: string]: number } = {};
        expenses.forEach(expense => {
                const amountBaseMinor = expense.amountBaseMinor || 0;
                categoryTotals[expense.expenseType] = (categoryTotals[expense.expenseType] || 0) + amountBaseMinor;
            });
        return Object.entries(categoryTotals)
          .map(([name, value]) => ({ name, value, translatedName: t(`expenses.${name.toLowerCase()}`) }))
          .sort((a, b) => b.value - a.value);
    }, [expenses, t]);
    
    const expensesByDay = useMemo(() => {
        const last7DaysMap = new Map<string, { date: string; expenses: number }>();
        for (let i = 6; i >= 0; i--) {
            const d = subDays(new Date(), i);
            const dateStr = format(d, 'EEE');
            last7DaysMap.set(format(d, 'yyyy-MM-dd'), { date: dateStr, expenses: 0 });
        }
    
        expenses.forEach((expense) => {
            const expenseDate = safeGetDate(expense.date);
            if (expenseDate) {
                const dateStr = format(startOfDay(expenseDate), 'yyyy-MM-dd');
                if (last7DaysMap.has(dateStr)) {
                    const dayRecord = last7DaysMap.get(dateStr)!;
                    const amountBaseMinor = expense.amountBaseMinor || 0;
                    dayRecord.expenses += amountBaseMinor;
                }
            }
        });
    
        return Array.from(last7DaysMap.values());
    }, [expenses]);
    
    const hasAnyExpenses = expenses && expenses.length > 0;

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard 
                    title={t('expenses.totalExpenses')}
                    value={formatMoneyMinor(totalExpenses, baseCurrency)}
                    icon={DollarSign}
                />
                <StatCard 
                    title={`${t('expenses.highestExpenseCategory')}`}
                    value={highestCategory}
                    icon={Tag}
                />
                <StatCard 
                    title={t('expenses.averageDailyExpense')}
                    value={formatMoneyMinor(avgDailyExpense, baseCurrency)}
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
                        <CardTitle>{`${t('expenses.expenseDistribution')} (${baseCurrency})`}</CardTitle>
                    </CardHeader>
                    <CardContent>
                       {hasAnyExpenses ? (
                            <ChartContainer config={{}} className="h-[250px] w-full">
                                <PieChart>
                                    <Pie 
                                        data={expenseDistribution} 
                                        dataKey="value" 
                                        nameKey="translatedName" 
                                        cx="50%" 
                                        cy="50%" 
                                        outerRadius={80} 
                                        labelLine={false}
                                        label={false}
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
                                            formatter={(value) => formatMoneyMinor(value as number, baseCurrency)} 
                                            nameKey="translatedName"
                                        />} 
                                    />
                                    <Legend formatter={(value) => t(value)} />
                                </PieChart>
                            </ChartContainer>
                       ) : (
                            <div className="h-[250px] flex flex-col items-center justify-center text-center text-muted-foreground">
                                <PieChartIcon className="h-10 w-10 mb-2" />
                                <p>{t('expenses.noExpensesRecorded')}</p>
                            </div>
                       )}
                    </CardContent>
                </Card>
                <Card className="lg:col-span-3">
                    <CardHeader>
                        <CardTitle>{`${t('expenses.expenseTrend')} (${baseCurrency})`}</CardTitle>
                    </CardHeader>
                    <CardContent>
                       {hasAnyExpenses ? (
                            <ChartContainer config={{ expenses: { label: t('expenses.pageTitle'), color: "#28c9c9" } }} className="h-[250px] w-full">
                                <BarChart data={expensesByDay}>
                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                                    <YAxis tickFormatter={(value) => formatMoneyMinor(value as number, baseCurrency).replace(/(\.00|,[00])$/, '')} />
                                    <Tooltip cursor={false} content={<ChartTooltipContent indicator="dot" formatter={(value) => formatMoneyMinor(value as number, baseCurrency)} />} />
                                    <Bar dataKey="expenses" fill="var(--color-expenses)" radius={8} />
                                </BarChart>
                            </ChartContainer>
                       ) : (
                            <div className="h-[250px] flex flex-col items-center justify-center text-center text-muted-foreground">
                                <BarChart2 className="h-10 w-10 mb-2" />
                                <p>{t('expenses.noExpensesRecorded')}</p>
                            </div>
                       )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
