
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PlusCircle, MoreHorizontal, Eye, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFirebase } from '@/firebase/provider';
import { addDoc, serverTimestamp, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import type { Client, ClientLedgerEntry, Currency } from '@/lib/types';
import AddClientDialog from '@/components/clients/add-client-dialog';
import EditClientDialog from '@/components/clients/edit-client-dialog';
import DeleteClientDialog from '@/components/clients/delete-client-dialog';
import MakePaymentDialog from '@/components/clients/make-payment-dialog';
import ClientLoanSheet from './client-loan-sheet';
import { useToast } from '@/hooks/use-toast';
import { useCompanyCollection } from '@/hooks/use-company-collection';
import { useCurrency } from '@/lib/currency-provider';
import { recordClientPaymentFIFO, recomputeClientOutstanding } from '@/lib/ledger-recompute';
import { companyCollection, companyDoc, withCompanyId } from '@/lib/firestore-path';
import { formatMoneyMinor } from '@/lib/money';
import { FancyCard } from '@/components/ui/fancy-card';

export default function ClientLoansPage() {
  const { t } = useTranslation();
  const { firestore, user, userProfile, companyId } = useFirebase();
  const { toast } = useToast();
  const { baseCurrency } = useCurrency();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const clientsOrder = useMemo(() => orderBy('createdAt', 'desc'), []);
  const { data: clients, loading: clientsLoading, error: clientsError } = useCompanyCollection<Client>('clients', clientsOrder);

  const handleAddClient = async (clientData: Omit<Client, 'id' | 'companyId' | 'createdAt'>) => {
    if (!firestore || !companyId) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
      return;
    }
    try {
      await addDoc(companyCollection(firestore, companyId, 'clients'), withCompanyId(companyId, {
        ...clientData,
        createdAt: serverTimestamp(),
        outstandingByCurrency: {},
        openPurchasesCount: 0,
      }));
      toast({ title: t('toast.success.clientAdded'), description: t('toast.success.clientAddedSuccessMessage') });
      setIsAddDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleUpdateClient = async (clientId: string, clientData: Partial<Client>) => {
    if (!firestore || !companyId) return;
    try {
      const clientRef = companyDoc(firestore, companyId, `clients/${clientId}`);
      await updateDoc(clientRef, clientData);
      toast({ title: t('toast.success.clientUpdated'), description: t('toast.success.clientUpdatedSuccessMessage') });
      setIsEditDialogOpen(false);
      setSelectedClient(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleDeleteClient = async () => {
    if (!firestore || !selectedClient?.id || !companyId) return;
    try {
      await deleteDoc(companyDoc(firestore, companyId, `clients/${selectedClient.id}`));
      toast({ title: t('toast.success.clientDeleted'), description: t('toast.success.clientDeletedSuccessMessage') });
      setIsDeleteDialogOpen(false);
      setSelectedClient(null);
    } catch (e: any) {
      toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };

  const handleMakePayment = async (clientId: string, amountMinor: number, currency: Currency, note?: string) => {
    if (!firestore || !companyId) {
        toast({ variant: "destructive", title: t('toast.error.title'), description: t('toast.error.companyIdMissingError') });
        return;
    }
    try {
        await recordClientPaymentFIFO(firestore, companyId, clientId, amountMinor, currency, note);
        toast({ title: t('toast.success.paymentRecorded'), description: t('toast.success.paymentRecordedSuccessMessage') });
        setIsPaymentDialogOpen(false);
        setSelectedClient(null);
    } catch (e: any) {
        toast({ variant: 'destructive', title: t('toast.error.title'), description: e.message });
    }
  };


  const openEditDialog = (client: Client) => {
    setSelectedClient(client);
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (client: Client) => {
    setSelectedClient(client);
    setIsDeleteDialogOpen(true);
  };

  const openPaymentDialog = (client: Client) => {
    setSelectedClient(client);
    setIsPaymentDialogOpen(true);
  };

  const openLoanSheet = (client: Client) => {
      setSelectedClient(client);
      setIsSheetOpen(true);
  }

  const totalOutstandingByCurrency = useMemo(() => {
    const totals: { [key in Currency]?: number } = {};
    clients.forEach(client => {
        for (const [currency, amount] of Object.entries(client.outstandingByCurrency || {})) {
            if (amount > 0) {
                totals[currency as Currency] = (totals[currency as Currency] || 0) + amount;
            }
        }
    });
    return totals;
  }, [clients]);

  if (clientsError) {
    return (
      <div className="p-6">
        <div className="border border-destructive/40 rounded-lg p-4">
          <div className="font-semibold text-destructive">{t('toast.error.title')}</div>
          <div className="text-sm mt-2 whitespace-pre-wrap">{clientsError.message}</div>
          <div className="text-xs mt-3 opacity-70">
            UID: {user?.uid || 'N/A'} | Role: {userProfile?.role || 'N/A'} | CompanyId: {companyId || 'N/A'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('clients.pageTitle')}</h1>
            <p className="text-muted-foreground">{t('clients.pageDescription')}</p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            {t('clients.addClient')}
          </Button>
        </div>

        <FancyCard>
          <CardHeader>
            <CardTitle>{t('clients.clientRecords')}</CardTitle>
            <CardDescription>
                {t('clients.totalOutstandingDebt')}:{' '}
                {Object.entries(totalOutstandingByCurrency).map(([cur, amt]) => (
                    <span key={cur} className="font-bold mr-4">{formatMoneyMinor(amt, cur as Currency)}</span>
                ))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {clientsLoading && <p>{t('clients.loadingClients')}...</p>}
            {!clientsLoading && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('clients.clientName')}</TableHead>
                    <TableHead>{t('clients.phoneNumber')}</TableHead>
                    <TableHead>{t('clients.location')}</TableHead>
                    <TableHead>{t('clients.outstandingDebt')}</TableHead>
                    <TableHead className="text-center">{t('clients.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => {
                    const clientOutstanding = Object.entries(client.outstandingByCurrency || {})
                        .filter(([_, value]) => value && value > 0)
                        .map(([currency, value]) => formatMoneyMinor(value, currency as Currency))
                        .join(' / ');

                    return (
                        <TableRow key={client.id}>
                        <TableCell className="font-medium">{client.name}</TableCell>
                        <TableCell>{client.phoneNumber || 'N/A'}</TableCell>
                        <TableCell>{client.location || 'N/A'}</TableCell>
                        <TableCell className="font-medium">{clientOutstanding || formatMoneyMinor(0, baseCurrency)}</TableCell>
                        <TableCell className="text-center">
                            <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">{t('clients.openMenu')}</span>
                                <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openLoanSheet(client)}>
                                    <Eye className="mr-2 h-4 w-4" />
                                    <span>{t('clients.viewLedger')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openPaymentDialog(client)}>
                                    <DollarSign className="mr-2 h-4 w-4" />
                                    <span>{t('clients.makePayment')}</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditDialog(client)}>
                                    {t('clients.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDeleteDialog(client)} className="text-destructive">
                                    {t('clients.delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                        </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </FancyCard>
      </div>
      <AddClientDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddClient={handleAddClient}
      />
      {selectedClient && (
        <EditClientDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          client={selectedClient}
          onUpdateClient={handleUpdateClient}
        />
      )}
      {selectedClient && (
        <DeleteClientDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleDeleteClient}
        />
      )}
      {selectedClient && (
        <MakePaymentDialog
          open={isPaymentDialogOpen}
          onOpenChange={setIsPaymentDialogOpen}
          client={selectedClient}
          onConfirm={handleMakePayment}
        />
      )}
       {selectedClient && (
        <ClientLoanSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          client={selectedClient}
        />
      )}
    </>
  );
}
