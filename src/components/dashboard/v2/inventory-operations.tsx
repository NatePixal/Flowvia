
"use client"

import { useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Product, Sale, Company } from '@/lib/types';
import { ChartTooltipContent, ChartContainer } from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import RecentShipments from './recent-shipments';
import { useFirebase, useDoc } from '@/firebase';
import { doc } from 'firebase/firestore';
import { AlertCircle } from 'lucide-react';
import WarehouseUsage from '@/components/inventory/warehouse-usage';

const InventoryOperations = memo(function InventoryOperations() {
    const { t } = useTranslation();
    const { firestore, userProfile } = useFirebase();

    const { data: products, loading: productsLoading } = useCompanyCollection<Product>('products');

    const companyDocRef = useMemo(() =>
        (firestore && userProfile?.companyId)
            ? doc(firestore, 'companies', userProfile.companyId)
            : null,
        [firestore, userProfile?.companyId]
    );

    const { data: company, isLoading: companyLoading } = useDoc<Company>(companyDocRef);

    const isLoading = productsLoading || companyLoading;

    const { topProducts } = useMemo(() => {
        if (!products) return { topProducts: [] };

        const sorted = [...products].sort((a,b) => b.quantity - a.quantity).slice(0, 3);

        return {
            topProducts: sorted
        };
    }, [products]);

    const chartConfig = {
      quantity: {
          label: t('dashboard.quantity'),
          color: "hsl(var(--primary))",
      },
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle>{t('dashboard.inventoryAndOperations')}</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-6">

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground mb-2">{t('dashboard.stockLevels')}</p>
                        <WarehouseUsage products={products || []} company={company ?? undefined} loading={isLoading} />
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground mb-2">{t('dashboard.topProducts')}</p>
                         <div className="h-[150px] w-full">
                            {isLoading ? <Skeleton className="h-full w-full" /> : (
                                <ChartContainer config={chartConfig} className="h-full w-full">
                                    <BarChart data={topProducts} layout="vertical" margin={{ left: 10, right: 10 }}>
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} tickMargin={5} width={80} fontSize={12} stroke="hsl(var(--muted-foreground))" tick={{ width: 100 }} />
                                        <Tooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                        <Bar dataKey="quantity" fill="var(--color-quantity)" radius={2} barSize={10} />
                                    </BarChart>
                                </ChartContainer>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col">
                    <p className="text-sm text-muted-foreground mb-2">{t('dashboard.recentShipments')}</p>
                    <div className="flex-1">
                        <RecentShipments />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});

export default InventoryOperations;
