
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, FileDown, PlusCircle, Eye, HandCoins } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoanDetailsSheet from '@/components/loans/loan-details-sheet';
import AddLoanDialog from '@/components/loans/add-loan-dialog';
import AddClientDialog from '@/components/loans/add-client-dialog';
import MakePaymentDialog from '@/components/loans/make-payment-dialog';
import { ClientLoan, Client, ClientPayment, ClientTransaction, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, addDoc, serverTimestamp, Timestamp, orderBy, runTransaction, doc, deleteDoc, updateDoc, where, getDocs } from 'firebase/firestore';
import DateRangePicker from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useCurrency, exchangeRates } from '@/lib/currency-provider';
import { useCompanyCollection } from '@/hooks/useCompanyCollection';
import { exportToCSV } from '@/lib/csv-export';

type AggregatedClient = {
  clientId: string;
  clientName: string;
  totalLoan: number;
  totalPaid: number;
  outstandingBalance: number;
  overpaidAmount: number;
  lastActivityDate: Date;
};

const LoansTable = ({ clients, onSelectClient }: { clients: AggregatedClient[], onSelectClient: (clientId: string) => void }) => {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();

  const formatDate = (date: Date) => {
    return format(date, 'yyyy-MM-dd');
  }

  const getStatus = (client: AggregatedClient) => {
    if (client.overpaidAmount > 0) return { label: t('overpaid'), variant: 'default', className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' };
    if (client.outstandingBalance > 0) return { label: t('pending'), variant: 'destructive', className: '' };
    return { label: t('settled'), variant: 'default', className: 'bg-green-500/20 text-green-700 border-green-500/30' };
  }

  return (
    <Table>
      <TableHeader>
          <TableRow>
          <TableHead className="truncate">{t('clientName')}</TableHead>
          <TableHead className="text-center">{t('status')}</TableHead>
          <TableHead className="text-right">{t('pendingAmount')}</TableHead>
          <TableHead className="text-right">{t('overpaidAmount')}</TableHead>
          <TableHead className="text-right">{t('lastActivity')}</TableHead>
          <TableHead className="text-center">{t('actions')}</TableHead>
          </TableRow>
      </TableHeader>
      <TableBody>
          {clients.map((client) => {
            const status = getStatus(client);
            return (
              <TableRow key={client.clientId}>
                  <TableCell className="font-medium truncate">{client.clientName}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={status.variant as any} className={status.className}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-destructive">{formatCurrency(client.outstandingBalance)}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatCurrency(client.overpaidAmount)}</TableCell>
                  <TableCell className="text-right">{formatDate(client.lastActivityDate)}</TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" onClick={() => onSelectClient(client.clientId)}>
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">{t('viewDetails')}</span>
                    </Button>
                    <Button variant="ghost" size="icon">
                        <MessageSquare className="h-4 w-4" />
                        <span className="sr-only">{t('sendReminder')}</span>
                    </Button>
                  </TableCell>
              </TableRow>
            )
          })}
      </TableBody>
      </Table>
  )
}

const LoansPageContent = () => {
  const { t } = useTranslation();
  const { firestore, userProfile } = useFirebase();
  const { toast } = useToast();

  const [isAddLoanDialogOpen, setIsAddLoanDialogOpen] = useState(false);
  const [isAddClientDialogOpen, setIsAddClientDialogOpen] = useState(false);
  const [isMakePaymentDialogOpen, setIsMakePaymentDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [statusFilter, setStatusFilter] = useState('all'); // Default to all

  // Data fetching
  const { data: clients } = useCompanyCollection<Client>('clients');
  const { data: transactions, isLoading: transactionsLoading } = useCompanyCollection<ClientTransaction>('client_transactions');
  const { data: clientLoans } = useCompanyCollection<ClientLoan>('client_loans');

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  
  // Calculate balances dynamically
  const aggregatedClients = useMemo(() => {
    const clientMap = new Map<string, AggregatedClient>();

    (clients || []).forEach(c => {
      if (c.id) {
        clientMap.set(c.id, {
          clientId: c.id,
          clientName: c.name,
          totalLoan: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          overpaidAmount: 0,
          lastActivityDate: new Date(0)
        });
      }
    });

    (transactions || []).forEach(tx => {
      const client = clientMap.get(tx.clientId);
      if (client) {
        const txDate = tx.createdAt instanceof Timestamp ? tx.createdAt.toDate() : new Date();
        
        // Assuming tx.amount is now in base currency
        if (tx.type === 'Loan') {
          client.totalLoan += tx.amount;
        } else if (tx.type === 'Payment') {
          client.totalPaid += -tx.amount;
        }

        if (txDate > client.lastActivityDate) {
          client.lastActivityDate = txDate;
        }
      }
    });
    
    clientMap.forEach(client => {
      const balance = client.totalLoan - client.totalPaid;
      if (balance > 0) {
        client.outstandingBalance = balance;
        client.overpaidAmount = 0;
      } else {
        client.outstandingBalance = 0;
        client.overpaidAmount = -balance;
      }
    });

    return Array.from(clientMap.values());
  }, [clients, transactions]);


  const filteredClients = useMemo(() => {
    return aggregatedClients
      .filter(client => {
          if (statusFilter === 'settled') return client.outstandingBalance <= 0 && client.overpaidAmount <= 0;
          if (statusFilter === 'pending') return client.outstandingBalance > 0;
          if (statusFilter === 'overpaid') return client.overpaidAmount > 0;
          return true; // 'all'
      })
      .filter(client => {
        if (!dateRange?.from) return true;
        const lastActivity = client.lastActivityDate;
        const from = dateRange.from;
        const to = dateRange.to || from;
        const toEndOfDay = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
        return lastActivity >= from && lastActivity <= toEndOfDay;
      })
      .sort((a,b) => b.lastActivityDate.getTime() - a.lastActivityDate.getTime());
  }, [aggregatedClients, dateRange, statusFilter]);

  
  const handleViewDetails = (clientId: string) => {
    setSelectedClientId(clientId);
    setIsSheetOpen(true);
  };

  const handleExport = () => {
    if (filteredClients.length > 0) {
      const dataToExport = filteredClients.map(c => ({
        [t('clientName')]: c.clientName,
        [t('status')]: c.outstandingBalance > 0 ? t('unsettled') : t('settled'),
        [t('outstandingBalance')]: c.outstandingBalance,
        [t('totalLoan')]: c.totalLoan,
        [t('totalPaid')]: c.totalPaid,
        [t('lastActivity')]: format(c.lastActivityDate, 'yyyy-MM-dd'),
      }));
      exportToCSV(dataToExport, 'client_loans.csv');
    } else {
      toast({
        variant: 'destructive',
        title: t('exportFailed'),
        description: t('noDataToExport'),
      });
    }
  };

  const handleAddLoan = async (newLoan: Omit<ClientLoan, 'id' | 'createdAt' | 'companyId'>) => {
    if(!firestore || !userProfile?.companyId) return;
    
    const client = (clients || []).find(c => c.id === newLoan.clientId);
    if (!client) {
      console.error("Client not found");
      toast({ variant: 'destructive', title: t('clientNotFound') });
      return;
    }
    
    try {
        const amountInBase = newLoan.loanAmount / exchangeRates[newLoan.currency];

        const loanDoc = {
            ...newLoan,
            amountBase: amountInBase,
            clientName: client.name,
            companyId: userProfile.companyId,
            createdAt: serverTimestamp(),
        };
        
        await runTransaction(firestore, async (transaction) => {
            const loanRef = doc(collection(firestore, 'client_loans'));
            transaction.set(loanRef, loanDoc);

            const txRef = doc(collection(firestore, 'client_transactions'));
            const txDoc = {
                clientId: newLoan.clientId,
                companyId: userProfile.companyId,
                type: "Loan",
                amount: amountInBase, // Use the base currency amount for the transaction ledger
                relatedId: loanRef.id,
                createdAt: serverTimestamp(),
            } as Omit<ClientTransaction, 'id'>;
            transaction.set(txRef, txDoc);
        });

        toast({ title: t('loanCreated'), description: t('loanRecordedSuccessfully') });
        setIsAddLoanDialogOpen(false);

    } catch (e: any) {
        console.error("Failed to add loan:", e);
        toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotCreateLoan') });
    }
  };

  const handleAddClient = async (newClient: Omit<Client, 'id' | 'createdAt' | 'companyId'>) => {
    if(firestore && userProfile?.companyId) {
      try {
        await addDoc(collection(firestore, 'clients'), {
          ...newClient,
          companyId: userProfile.companyId,
          createdAt: serverTimestamp(),
        });
        toast({ title: t('clientCreated'), description: `${newClient.name} ${t('hasBeenAdded')}.` });
        setIsAddClientDialogOpen(false);
      } catch (e: any) {
        console.error("Failed to add client:", e);
        toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotCreateClient') });
      }
    }
  };
  
  const handleMakePayment = async (paymentData: { clientId: string; amount: number; method: "Cash" | "Bank" | "Other"; reference?: string; date: Date }) => {
    if (!firestore || !userProfile?.companyId) {
      toast({
        variant: 'destructive',
        title: t('error'),
        description: t('firestoreNotAvailable'),
      });
      return;
    }
    try {
      const paymentDoc = {
        clientId: paymentData.clientId,
        companyId: userProfile.companyId,
        amount: paymentData.amount,
        method: paymentData.method,
        reference: paymentData.reference || '',
        paymentDate: Timestamp.fromDate(paymentData.date),
        createdAt: serverTimestamp(),
      };
      
      await runTransaction(firestore, async (transaction) => {
          const paymentRef = doc(collection(firestore, 'client_payments'));
          transaction.set(paymentRef, paymentDoc);
          
          const txRef = doc(collection(firestore, 'client_transactions'));
          const transactionDoc = {
             clientId: paymentData.clientId,
             companyId: userProfile.companyId,
             type: "Payment",
             amount: -paymentData.amount, // Store as negative for ledger calculations. Assumes payment is in base currency.
             relatedId: paymentRef.id,
             createdAt: serverTimestamp(),
          } as Omit<ClientTransaction, 'id'>;
          transaction.set(txRef, transactionDoc);
      });

      toast({
        title: t('paymentRecorded'),
        description: `${t('paymentOf')} ${paymentData.amount} ${t('hasBeenRecorded')}.`,
      });
      setIsMakePaymentDialogOpen(false);

    } catch (e: any) {
      console.error('Failed to record payment:', e);
      toast({
        variant: 'destructive',
        title: t('error'),
        description: e.message || t('couldNotRecordPayment'),
      });
    }
  };
  
    const handleUpdateLoan = async (loanId: string, updatedData: Partial<Omit<ClientLoan, 'id'>>) => {
        if (!firestore || !userProfile?.companyId) return;

        try {
            await runTransaction(firestore, async (transaction) => {
                const loanRef = doc(firestore, 'client_loans', loanId);
                const txQuery = query(
                    collection(firestore, 'client_transactions'), 
                    where('relatedId', '==', loanId), 
                    where('companyId', '==', userProfile.companyId)
                );
                
                const txSnapshot = await getDocs(txQuery);
                if (txSnapshot.empty) {
                    throw new Error(t('relatedTransactionNotFound'));
                }
                const txDoc = txSnapshot.docs[0];
                const txRef = txDoc.ref;
                
                const amountInBase = updatedData.loanAmount! / exchangeRates[updatedData.currency!];

                transaction.update(loanRef, { ...updatedData, amountBase: amountInBase });
                transaction.update(txRef, { amount: amountInBase });
            });
            toast({ title: t('loanUpdated'), description: t('loanAndLedgerUpdated') });

        } catch (e: any) {
            toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotUpdateLoan') });
        }
    };
    
    const handleDeleteLoan = async (loanId: string) => {
        if (!firestore || !userProfile?.companyId) return;

        try {
            await runTransaction(firestore, async (transaction) => {
                const loanRef = doc(firestore, 'client_loans', loanId);
                 const txQuery = query(
                    collection(firestore, 'client_transactions'), 
                    where('relatedId', '==', loanId), 
                    where('companyId', '==', userProfile.companyId)
                );
                
                const txSnapshot = await getDocs(txQuery);
                if (!txSnapshot.empty) {
                    const txDoc = txSnapshot.docs[0];
                    transaction.delete(txDoc.ref);
                }
                
                transaction.delete(loanRef);
            });
            toast({ title: t('loanDeleted'), description: t('loanAndLedgerEntryDeleted') });

        } catch (e: any) {
            toast({ variant: 'destructive', title: t('error'), description: e.message || t('couldNotDeleteLoan') });
        }
    };

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('clientLoansAndReceivables')}</h1>
          <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport}>
                  <FileDown className="mr-2 h-4 w-4" />
                  {t('export')}
              </Button>
               <Button onClick={() => setIsAddClientDialogOpen(true)} variant="secondary">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('newClient')}
              </Button>
              <Button onClick={() => setIsAddLoanDialogOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('newLoan')}
              </Button>
              <Button onClick={() => setIsMakePaymentDialogOpen(true)} variant="outline">
                  <HandCoins className="mr-2 h-4 w-4" />
                  {t('makePayment')}
              </Button>
          </div>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle>{t('outstandingReceivables')}</CardTitle>
              <div className="flex gap-2 flex-wrap">
                <DateRangePicker date={dateRange} onDateChange={setDateRange} />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder={t('filterByStatus')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('all')}</SelectItem>
                        <SelectItem value="pending">{t('pending')}</SelectItem>
                        <SelectItem value="settled">{t('settled')}</SelectItem>
                        <SelectItem value="overpaid">{t('overpaid')}</SelectItem>
                    </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? <p>{t('loading')}...</p> : <LoansTable clients={filteredClients} onSelectClient={handleViewDetails} />}
          </CardContent>
        </Card>
      </div>
      {selectedClientId && (
        <LoanDetailsSheet
          open={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          clientId={selectedClientId}
          clients={clients || []}
          clientLoans={clientLoans || []}
          onUpdateLoan={handleUpdateLoan}
          onDeleteLoan={handleDeleteLoan}
        />
      )}
      <AddLoanDialog
        open={isAddLoanDialogOpen}
        onOpenChange={setIsAddLoanDialogOpen}
        onAddLoan={handleAddLoan}
        clients={clients || []}
      />
      <AddClientDialog
        open={isAddClientDialogOpen}
        onOpenChange={setIsAddClientDialogOpen}
        onAddClient={handleAddClient}
      />
      <MakePaymentDialog
        open={isMakePaymentDialogOpen}
        onOpenChange={setIsMakePaymentDialogOpen}
        onMakePayment={handleMakePayment}
        clients={clients || []}
      />
    </>
  )
}


export default function LoansPage() {
  return (
    <LoansPageContent />
  );
}
