'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { orderBy, query } from 'firebase/firestore';
import type { Client, ClientLedgerEntry, Currency } from '@/lib/types';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { useCompanyCollection } from '@/hooks/use-company-collection';
import { formatMoneyMinor } from '@/lib/money';

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

  // Ledger is stored under: companies/{companyId}/clients/{clientId}/ledger
  const ledgerOrder = useMemo(() => orderBy('createdAt', 'desc'), []);
  const { data: ledger, loading, error } = useCompanyCollection<ClientLedgerEntry>(
    `clients/${client.id}/ledger`,
    ledgerOrder
  );


  const totalsByCurrency = useMemo(() => {
    const totals: Partial<Record<Currency, number>> = {};

    // Prefer the precomputed outstandingByCurrency if present
    const fromClient = client.outstandingByCurrency || {};
    for (const [cur, amt] of Object.entries(fromClient)) {
      const n = Number(amt);
      if (Number.isFinite(n) && n > 0) totals[cur as Currency] = (totals[cur as Currency] || 0) + n;
    }

    // If not present, derive it from ledger purchases
    if (Object.keys(totals).length === 0 && Array.isArray(ledger)) {
      for (const e of ledger) {
        if (e.type !== 'purchase') continue;
        const cur = e.currency as Currency;
        const due = Number(e.dueMinor || 0);
        if (Number.isFinite(due) && due > 0) totals[cur] = (totals[cur] || 0) + due;
      }
    }

    return totals;
  }, [client.outstandingByCurrency, ledger]);

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
              <CardTitle className="text-base">{t('clients.outstandingDebt')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {Object.keys(totalsByCurrency).length === 0 ? (
                <div className="text-muted-foreground">—</div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {Object.entries(totalsByCurrency).map(([cur, amt]) => (
                    <div key={cur} className="font-semibold">
                      {formatMoneyMinor(Number(amt || 0), cur as Currency)}
                    </div>
                  ))}
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
