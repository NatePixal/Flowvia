
'use client';
import { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from 'react-i18next';
import { Timestamp, orderBy, QueryConstraint } from 'firebase/firestore';
import type { Sale } from '@/lib/types';
import { format } from 'date-fns';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';


type RecentShipmentItem = {
  id: string;
  productName: string;
  quantity: number;
  status: 'Shipped' | 'Pending' | 'Delivered' | 'Cancelled';
  date: string;
};

export default function RecentShipments() {
  const { t } = useTranslation();

  const constraints = useMemo(() => [
      orderBy('createdAt', 'desc')
  ], []);

  const { data: salesDocs, loading: salesLoading } = useCompanyCollection<Sale>(
    'sales', 
    ...constraints
  );
  
  const recentShipments: RecentShipmentItem[] = useMemo(() => {
    return (salesDocs || [])
    .slice(0, 5)
    .map(s => ({
      id: s.id!,
      productName: s.productName,
      quantity: s.quantity,
      status: 'Delivered', // Assuming all sales are delivered for this view
      date: s.date instanceof Timestamp ? format(s.date.toDate(), 'yyyy.MM.dd') : format(new Date(s.date as any), 'yyyy.MM.dd'),
    }));
  }, [salesDocs]);


  if (salesLoading) {
    return (
        <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
        </div>
    )
  }

  return (
    <Table>
      <TableHeader>
          <TableRow className="border-border/20 hover:bg-transparent">
          <TableHead className="px-2 text-xs text-muted-foreground">{t('dashboard.product')}</TableHead>
          <TableHead className="px-2 text-xs text-muted-foreground text-center">{t('dashboard.quantity')}</TableHead>
          <TableHead className="px-2 text-xs text-muted-foreground text-center">{t('dashboard.status')}</TableHead>
          <TableHead className="px-2 text-xs text-muted-foreground text-right">{t('dashboard.date')}</TableHead>
          </TableRow>
      </TableHeader>
      <TableBody>
          {recentShipments.map((shipment) => (
          <TableRow key={shipment.id} className="border-border/20 hover:bg-transparent">
              <TableCell className="px-2 py-1.5 text-xs font-medium text-foreground truncate">{shipment.productName}</TableCell>
              <TableCell className="px-2 py-1.5 text-xs text-muted-foreground text-center">{shipment.quantity}</TableCell>
               <TableCell className="px-2 py-1.5 text-xs text-center">
                    <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">{t(`status.${shipment.status.toLowerCase()}`)}</Badge>
               </TableCell>
              <TableCell className="px-2 py-1.5 text-xs text-muted-foreground text-right">{shipment.date}</TableCell>
          </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
