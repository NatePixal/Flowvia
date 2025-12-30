
'use client';

import { useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Client, ClientTransaction, ClientLoan, Currency } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useMemoFirebase } from '@/firebase/provider';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useCurrency } from '@/lib/currency-provider';
import { useFirebase } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import EditLoanDialog from './edit-loan-dialog';
import DeleteLoanDialog from './delete-loan-dialog';

interface LoanDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clients: Client[];
  clientLoans: ClientLoan[];
  onUpdateLoan: (loanId: string, updatedData: Partial<Omit<ClientLoan, 'id'>>) => void;
  onDeleteLoan: (loanId: string) => void;
}

export default function LoanDetailsSheet({ 
    open, 
    onOpenChange, 
    clientId, 
    clients, 
    clientLoans,
    onUpdateLoan,
    onDeleteLoan,
}: LoanDetailsSheetProps) {
  const { t } = useTranslation();
  const { firestore } = useFirebase();
  const { formatCurrency } = useCurrency();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<ClientLoan | null>(null);

  const clientTransactionsQuery = useMemoFirebase(
    () =>
      firestore && clientId
        ? query(collection(firestore, 'client_transactions'), where('clientId', '==', clientId))
        : null,
    [firestore, clientId]
  );
  const { data: transactionsCollection, isLoading: transactionsLoading } = useCollection<ClientTransaction>(clientTransactionsQuery);

  const client = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

  const { totalLoan, totalPaid, outstandingBalance, sortedTransactions } = useMemo(() => {
    let loanTotal = 0;
    let paidTotal = 0;
    const transactions = transactionsCollection || [];

    transactions.forEach(tx => {
        if (tx.type === 'Loan') {
            loanTotal += tx.amount;
        } else if (tx.type === 'Payment') {
            paidTotal += -tx.amount;
        }
    });
    
    const getDate = (tx: ClientTransaction): number => {
        if (!tx.createdAt) return 0;
        return tx.createdAt instanceof Timestamp ? tx.createdAt.toMillis() : new Date(tx.createdAt as any).getTime();
    }

    const sortedTxs = [...transactions].sort((a,b) => getDate(b) - getDate(a));

    return {
        totalLoan: loanTotal,
        totalPaid: paidTotal,
        outstandingBalance: loanTotal - paidTotal,
        sortedTransactions: sortedTxs,
    };
  }, [transactionsCollection]);

  const formatDate = (date: Timestamp | string | undefined) => {
    if (!date) return 'N/A';
    const d = date instanceof Timestamp ? date.toDate() : new Date(date);
    return format(d, 'yyyy-MM-dd HH:mm');
  }

  const findLoanForTransaction = (transaction: ClientTransaction): ClientLoan | undefined => {
    if (transaction.type !== 'Loan') return undefined;
    return clientLoans.find(loan => loan.id === transaction.relatedId);
  }
  
  const openEditDialog = (loan: ClientLoan) => {
      setSelectedLoan(loan);
      setIsEditDialogOpen(true);
  }
  const openDeleteDialog = (loan: ClientLoan) => {
      setSelectedLoan(loan);
      setIsDeleteDialogOpen(true);
  }
  
  const handleUpdate = (updatedData: { amount: number, currency: Currency, description: string }) => {
    if (selectedLoan) {
      onUpdateLoan(selectedLoan.id!, updatedData);
      setIsEditDialogOpen(false);
    }
  };
  
  const handleDelete = () => {
    if (selectedLoan) {
      onDeleteLoan(selectedLoan.id!);
      setIsDeleteDialogOpen(false);
    }
  };


  if (!client) {
    return null;
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl flex flex-col">
          <SheetHeader>
            <SheetTitle>{t('transactionHistory')}: {client.name}</SheetTitle>
            <SheetDescription>
              {t('completeTransactionLedger')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4 flex-1 overflow-y-auto p-1">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">{t('financialSummary')}</h3>
              <div className="mt-2 space-y-2 text-sm">
                 <div className="flex justify-between">
                  <span>{t('outstandingBalance')}:</span>
                  <span className="font-semibold text-lg">{formatCurrency(outstandingBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('totalLoan')}:</span>
                  <span className="font-medium">{formatCurrency(totalLoan)}</span>
                </div>
                 <div className="flex justify-between">
                  <span>{t('totalAmountPaid')}:</span>
                  <span className="font-medium">{formatCurrency(totalPaid)}</span>
                </div>
              </div>
            </div>
            <Separator />
             <div>
              <h3 className="text-sm font-medium text-muted-foreground">{t('transactionLedger')}</h3>
              <div className="mt-2 text-sm">
                {transactionsLoading ? (
                  <p>{t('loading')}...</p>
                ) : sortedTransactions && sortedTransactions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('date')}</TableHead>
                        <TableHead>{t('type')}</TableHead>
                        <TableHead>{t('description')}</TableHead>
                        <TableHead className="text-right">{t('amount')}</TableHead>
                        <TableHead className="text-center">{t('actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedTransactions.map((tx) => {
                        const relatedLoan = findLoanForTransaction(tx);
                        return (
                        <TableRow key={tx.id}>
                          <TableCell>{formatDate(tx.createdAt)}</TableCell>
                          <TableCell>
                              <Badge variant={tx.type === 'Loan' ? 'secondary' : 'default'} className={tx.type === 'Payment' ? 'bg-green-500/20 text-green-700 border-green-500/30' : ''}>
                                  {t(tx.type.toLowerCase() as 'loan' | 'payment')}
                              </Badge>
                          </TableCell>
                          <TableCell className="truncate max-w-[200px]">
                              {relatedLoan?.description}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${tx.type === 'Loan' ? 'text-destructive' : 'text-green-600'}`}>
                              {tx.type === 'Loan' ? `+${formatCurrency(tx.amount)}` : `-${formatCurrency(-tx.amount)}`}
                          </TableCell>
                           <TableCell className="text-center">
                            {tx.type === 'Loan' && relatedLoan && (
                                 <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">{t('openMenu')}</span>
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(relatedLoan)}>{t('edit')}</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => openDeleteDialog(relatedLoan)} className="text-destructive">{t('delete')}</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                       );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground">{t('noTransactionsFound')}</p>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {selectedLoan && isEditDialogOpen && (
          <EditLoanDialog 
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
            loan={selectedLoan}
            onUpdateLoan={handleUpdate}
            clients={clients}
          />
      )}
      {selectedLoan && isDeleteDialogOpen && (
          <DeleteLoanDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onConfirm={handleDelete}
          />
      )}
    </>
  );
}

    