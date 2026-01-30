
"use client";

import { useMemo, memo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, Tooltip } from "recharts";
import { useTranslation } from "react-i18next";
import { useCompanyCollection } from "@/hooks/use-company-collection";
import { Currency, Sale } from "@/lib/types";
import { subDays, format, startOfDay } from "date-fns";
import { ChartContainer } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirebase } from '@/firebase';
import { Timestamp } from "firebase/firestore";
import { formatMoneyMinor, toMinor, convertMinorToBase } from "@/lib/money";

const safeGetDate = (date: string | Timestamp | Date): Date => {
  if (date instanceof Timestamp) return date.toDate();
  return new Date(date);
};

function inferSaleRevenueMinor(sale: Sale, currency: Currency): number {
  const s: any = sale;

  // 1) Prefer explicit minor totals if they exist (best)
  if (typeof s.saleTotalMinor === "number") return s.saleTotalMinor;
  if (typeof s.totalMinor === "number") return s.totalMinor;
  if (typeof s.revenueMinor === "number") return s.revenueMinor;

  // 2) Next best: compute from unit price * quantity
  if (typeof s.salePrice === "number" && typeof s.quantity === "number") {
    return toMinor(s.salePrice * s.quantity, currency);
  }

  // 3) If you store totals in major units
  if (typeof s.saleTotal === "number") return toMinor(s.saleTotal, currency);
  if (typeof s.total === "number") return toMinor(s.total, currency);

  // 4) Handle totalPrice ambiguity:
  // If no explicit totals exist, assume totalPrice is a UNIT price and multiply by quantity.
  if (typeof s.totalPrice === "number") {
    const hasExplicitTotal =
      typeof s.saleTotalMinor === "number" ||
      typeof s.totalMinor === "number" ||
      typeof s.revenueMinor === "number" ||
      typeof s.saleTotal === "number" ||
      typeof s.total === "number";

    if (!hasExplicitTotal && typeof s.quantity === "number") {
      return toMinor(s.totalPrice * s.quantity, currency);
    }

    // Otherwise treat it as already-total (legacy schemas)
    return toMinor(s.totalPrice, currency);
  }

  return 0;
}

const SalesPerformance = memo(function SalesPerformance() {
  const { t } = useTranslation();
  const { companyBaseCurrency } = useFirebase();
  const reportCurrency = companyBaseCurrency || 'USD';
  const { data: sales, loading: salesLoading } = useCompanyCollection<Sale>("sales");
  const isLoading = salesLoading;

  const weeklySales = useMemo(() => {
    const weekMap = new Map<string, { name: string; sales: number; date: string }>();
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const day = subDays(today, i);
      const dayName = format(day, "EEE");
      const fullDateStr = format(startOfDay(day), "yyyy-MM-dd");
      const tooltipDate = format(day, "MMM dd, yyyy");
      weekMap.set(fullDateStr, { name: dayName, sales: 0, date: tooltipDate });
    }

    (sales || [])
      .forEach((sale) => {
        const saleDate = safeGetDate((sale as any).date);
        const fullDateStr = format(startOfDay(saleDate), "yyyy-MM-dd");

        if (weekMap.has(fullDateStr)) {
          const dayData = weekMap.get(fullDateStr)!;

          let revenueBase = sale.revenueBaseMinor;
          if (revenueBase === undefined && sale.fx) {
              revenueBase = convertMinorToBase(sale.revenueMinor ?? 0, sale.fx.rateToBase, sale.salePriceCurrency, reportCurrency);
          } else if (revenueBase === undefined && sale.salePriceCurrency === reportCurrency) {
              revenueBase = sale.revenueMinor;
          }

          dayData.sales += revenueBase ?? 0;
        }
      });

    return Array.from(weekMap.values());
  }, [sales, reportCurrency]);

  const chartConfig = {
    sales: { label: t("dashboard.sales"), color: "hsl(var(--primary))" },
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>{t("dashboard.salesPerformance")}</CardTitle>
        <CardDescription>
          {t("dashboard.weeklySales")} ({reportCurrency})
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-6">
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <AreaChart data={weeklySales} margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} stroke="hsl(var(--muted-foreground))" />

              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background/80 backdrop-blur-sm p-2 shadow-sm">
                        <div className="grid grid-cols-1 gap-1.5">
                          <div className="flex flex-col">
                            <span className="text-[0.7rem] uppercase text-muted-foreground">{(payload[0] as any).payload.name}</span>
                            <span className="text-xs text-muted-foreground">{(payload[0] as any).payload.date}</span>
                          </div>
                          <span className="font-bold text-foreground">{formatMoneyMinor(payload[0].value as number, reportCurrency)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              <Area dataKey="sales" type="monotone" fill="url(#colorSales)" stroke="var(--color-sales)" strokeWidth={2} />
            </AreaChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
});

export default SalesPerformance;
