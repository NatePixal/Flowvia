// src/app/[locale]/(app)/dashboard/page.tsx
'use client';

import FinancialOverview from '@/components/dashboard/v2/financial-overview';
import GlobalStats from '@/components/dashboard/v2/global-stats';
import InventoryOperations from '@/components/dashboard/v2/inventory-operations';
import SalesPerformance from '@/components/dashboard/v2/sales-performance';
import { useTranslation } from 'react-i18next';

export default function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
        <GlobalStats />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <SalesPerformance />
            </div>
            <div className="lg:col-span-1">
                 <FinancialOverview />
            </div>
        </div>
        <div className="grid grid-cols-1">
             <InventoryOperations />
        </div>
    </div>
  );
}
