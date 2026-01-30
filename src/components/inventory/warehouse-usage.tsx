
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import type { Product, Company } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertCircle, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface WarehouseUsageProps {
  products: Product[];
  company: Company | undefined;
  loading: boolean;
}

export default function WarehouseUsage({ products, company, loading }: WarehouseUsageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const {
    usedCapacity,
    totalCapacity,
    usagePercentage,
    isCapacitySet,
    remainingCapacity,
    capacityUnitLabel
  } = useMemo(() => {
    const isSet = company?.warehouseCapacity && company.warehouseCapacity > 0;
    if (!isSet || !products) {
      return { isCapacitySet: false, usagePercentage: 0, usedCapacity: 0, totalCapacity: 0, remainingCapacity: 0, capacityUnitLabel: '' };
    }

    const capacity = company.warehouseCapacity!;
    const capacityType = company.warehouseCapacityType || 'units';

    let used = 0;
    if (capacityType === 'units') {
      used = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    } else { // volume
      used = products.reduce((sum, p) => sum + ((p.quantity || 0) * (p.unitVolume || 0)), 0);
    }

    const percentage = capacity > 0 ? (used / capacity) * 100 : 0;
    const clampedPercentage = Math.min(100, Math.round(percentage));
    const unitLabel = capacityType === 'units' ? t('inventory.units') : 'm³';

    return {
      isCapacitySet: true,
      usagePercentage: clampedPercentage,
      usedCapacity: used,
      totalCapacity: capacity,
      remainingCapacity: capacity - used,
      capacityUnitLabel: unitLabel
    };
  }, [products, company, t]);

  const progressBarColor = useMemo(() => {
    if (usagePercentage > 90) return 'bg-red-500';
    if (usagePercentage > 70) return 'bg-orange-500';
    return 'bg-green-500';
  }, [usagePercentage]);
  
  const handleGoToSettings = () => {
    const locale = pathname.split('/')[1] || 'en';
    router.push(`/${locale}/settings`);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('inventory.warehouseUsage')}</CardTitle>
          <CardDescription>{t('inventory.warehouseUsageDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <div className="flex justify-between">
            <Skeleton className="h-5 w-1/4" />
            <Skeleton className="h-5 w-1/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('inventory.warehouseUsage')}</CardTitle>
        <CardDescription>{t('inventory.warehouseUsageDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {!isCapacitySet ? (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-4 border-2 border-dashed rounded-lg">
            <AlertCircle className="h-10 w-10 mb-2" />
            <p className="font-semibold">{t('inventory.capacityNotSet')}</p>
            <Button variant="link" size="sm" onClick={handleGoToSettings}>
                {t('inventory.goToSettings')}
            </Button>
          </div>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-2 cursor-pointer">
                  <Progress value={usagePercentage} indicatorClassName={progressBarColor} />
                  <div className="flex justify-between text-sm font-medium">
                    <span>{t('inventory.used')}</span>
                    <span className={cn(
                        usagePercentage > 90 && "text-red-500",
                        usagePercentage > 70 && usagePercentage <= 90 && "text-orange-500"
                    )}>{usagePercentage}%</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="grid gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inventory.usedCapacity')}:</span>
                    <span>{usedCapacity.toLocaleString()} {capacityUnitLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('inventory.totalCapacity')}:</span>
                    <span>{totalCapacity.toLocaleString()} {capacityUnitLabel}</span>
                  </div>
                   <div className="flex justify-between font-semibold">
                    <span className="text-muted-foreground">{t('inventory.remainingSpace')}:</span>
                    <span>{remainingCapacity.toLocaleString()} {capacityUnitLabel}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}
