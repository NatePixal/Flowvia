
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orderBy, query } from 'firebase/firestore';
import type { Client, ClientLedgerEntry, Currency } from '@/lib/types';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { formatMoneyMinor } from '@/lib/money';
import { useCurrency } from '@/lib/currency-provider';

function formatDateSafe(v: any): string {
  try {
    const d =
      v?.toDate?.() instanceof Date
        ? v.toDate()
        : typeof v === 'string' || typeof v === 'number'
          ? new Date(v)
          : null;

    if (!d || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString();
  } catch {
    return '—';
  }
}

interface Props {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
  client: Client;
}

export default function ClientLoanSheet({ open, onOpenChange, client }: Props) {
  const { t } = useTranslation();
  const { baseCurrency } = useCurrency();

  // Ledger is stored under: companies/{companyId}/clients/{clientId}/ledger
  const ledgerOrder = useMemo(() => orderBy('createdAt', 'desc'), []);
  const { data: ledger, loading, error } = useCompanyCollection<ClientLedgerEntry>(
    `clients/${client.id}/ledger`,
    ledgerOrder
  );

  const balanceItems = useMemo(() => {
    return Object.entries(client.outstandingByCurrency || {})
      .map(([currency, value]) => ({ currency: currency as Currency, value: value || 0 }))
      .filter(item => item.value !== 0);
  }, [client.outstandingByCurrency]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('clients.viewLedger')}</SheetTitle>
          <SheetDescription>
            {client?.name ? `${client.name}` : '—'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('clients.balanceSummary')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              {balanceItems.length > 0 ? (
                balanceItems.map(({ currency, value }) => {
                  const isDebt = value > 0;
                  const isCredit = value < 0;
                  return (
                    <div key={currency} className={cn("flex items-center justify-between rounded-lg border p-3", isDebt ? "border-destructive/50 bg-destructive/5" : isCredit ? "border-success/50 bg-success/5" : "border-border")}>
                      <div>
                        <div className={cn("font-semibold", isDebt ? "text-destructive" : isCredit ? "text-success" : "text-muted-foreground")}>
                          {formatMoneyMinor(Math.abs(value), currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">{currency}</div>
                      </div>
                      {isDebt && <Badge variant="destructive">{t('clients.hasLoan')}</Badge>}
                      {isCredit && <Badge variant="success">{t('clients.overpaid')}</Badge>}
                    </div>
                  );
                })
              ) : (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="font-semibold text-muted-foreground">{formatMoneyMinor(0, baseCurrency)}</div>
                  </div>
                  <Badge variant="outline">{t('clients.settled')}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('clients.ledgerEntries')}</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                  <div className="border border-destructive/40 rounded-lg p-4">
                    <div className="font-semibold text-destructive">{t('toast.error.title')}</div>
                    <div className="text-sm mt-2 whitespace-pre-wrap">{String(error.message || error)}</div>
                  </div>
                ) : loading ? (
                <p>{t('clients.loading')}...</p>
              ) : ledger.length === 0 ? (
                <p className="text-muted-foreground">{t('clients.noLedgerEntries')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.date')}</TableHead>
                      <TableHead>{t('clients.type')}</TableHead>
                      <TableHead>{t('clients.details')}</TableHead>
                      <TableHead className="text-right">{t('clients.amount')}</TableHead>
                      <TableHead className="text-right">{t('clients.paid')}</TableHead>
                      <TableHead className="text-right">{t('clients.due')}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {ledger.map((e) => {
                      const cur = e.currency as Currency;

                      const amountMinor =
                        e.type === 'payment'
                          ? Number(e.paymentMinor || 0)
                          : Number(e.totalMinor || 0);

                      const paidMinor = Number(e.paidMinor || 0);
                      const dueMinor = Number(e.dueMinor || 0);

                      return (
                        <TableRow key={e.id || `${e.type}-${String(e.createdAt)}`}>
                          <TableCell>{formatDateSafe(e.createdAt)}</TableCell>
                          <TableCell className="capitalize">{t(`clients.${e.type}`)}</TableCell>
                          <TableCell className="max-w-[260px] truncate">
                            {e.type === 'purchase' && e.items?.length
                              ? e.items.map(it => `${it.qty}× ${it.name}`).join(', ')
                              : (e.note || '—')}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoneyMinor(amountMinor, cur)}
                          </TableCell>
                          <TableCell className="text-right">
                            {e.type === 'purchase' ? formatMoneyMinor(paidMinor, cur) : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {e.type === 'purchase' ? formatMoneyMinor(dueMinor, cur) : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
