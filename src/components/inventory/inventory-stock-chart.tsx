'use client';

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartTooltipContent, ChartContainer } from '@/components/ui/chart';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import type { Product } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Package } from 'lucide-react';


interface InventoryStockChartProps {
  products: Product[] | null;
  loading: boolean;
}

export default function InventoryStockChart({ products, loading }: InventoryStockChartProps) {
  const { t } = useTranslation();
  
  const topProducts = useMemo(() => {
    if (!products) return [];
    return products
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10) // Show top 10 products
      .map(p => ({ name: p.name, quantity: p.quantity }));
  }, [products]);

  const chartConfig = {
    quantity: {
      label: t('inventory.quantity'),
      color: "hsl(var(--primary))",
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('inventory.availableStock')}</CardTitle>
        <CardDescription>{t('inventory.top10ProductsByStock')}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
           <div className="h-[300px] w-full flex items-center justify-center">
             <Skeleton className="h-full w-full" />
           </div>
        ) : !products || products.length === 0 ? (
           <div className="h-[300px] w-full flex flex-col items-center justify-center text-center text-muted-foreground">
             <Package className="h-12 w-12 mb-4" />
             <p>{t('inventory.noProductsFound')}</p>
             <p className="text-sm">{t('inventory.addProductsToSeeInventory')}</p>
           </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full pr-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={topProducts} 
                layout="vertical"
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tickLine={false} 
                  axisLine={false} 
                  tickMargin={10}
                  width={120}
                  tick={{
                    fontSize: 12,
                    fill: 'hsl(var(--muted-foreground))'
                  }}
                  // @ts-ignore
                  textAnchor="start"
                  dx={-115}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Bar dataKey="quantity" fill="var(--color-quantity)" radius={5} />
              </BarChart>
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
