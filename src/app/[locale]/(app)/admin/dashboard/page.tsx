'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarCheck, CheckCircle2, CreditCard, Lock, MoreHorizontal, RefreshCcw, ShieldCheck, Unlock, UserPlus } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { runSubscriptionExpiryCheckNow, superAdminConfirmManualPayment, superAdminInviteCompany, superAdminListCompanies, superAdminSetCompanyStatus } from '@/lib/flowvia-functions';
import { useFirebase } from '@/firebase/provider';

type CompanyRow = {
  companyId: string;
  name: string;
  ownerId: string | null;
  subscriptionStatus: string;
  subscriptionProvider?: string | null;
  subscriptionId?: string | null;
  subscriptionPeriodStart?: unknown;
  subscriptionPeriodEnd?: unknown;
  lastPaymentAt?: unknown;
  isPaid: boolean;
  administrativeLock: boolean;
  userCount: number;
  createdAt: unknown;
  updatedAt: unknown;
};

type PendingAction = {
  company: CompanyRow;
  label: string;
  patch: {
    administrativeLock?: boolean;
    forcedSubscriptionStatus?: string;
    isPaid?: boolean;
    trialEndsAt?: string | null;
  };
};

function statusBadge(status: string, locked: boolean) {
  if (locked) return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  if (status === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'trialing') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-400/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

export default function AdminDashboardPage() {
  const { isSystemAdmin } = useFirebase();
  const { toast } = useToast();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(null);
  const [manualCompany, setManualCompany] = useState<CompanyRow | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCompanyName, setInviteCompanyName] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualCurrency, setManualCurrency] = useState('UZS');
  const [manualPeriodStart, setManualPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualPeriodEnd, setManualPeriodEnd] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [manualReceipt, setManualReceipt] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [mutating, setMutating] = useState(false);

  const isSystemAdminView = isSystemAdmin;

  const stats = useMemo(() => {
    const totalCompanies = companies.length;
    const activeCompanies = companies.filter((company) => company.subscriptionStatus === 'active' && !company.administrativeLock).length;
    const blockedCompanies = companies.filter((company) => company.administrativeLock).length;
    const trialCompanies = companies.filter((company) => company.subscriptionStatus === 'trialing').length;
    const paidCompanies = companies.filter((company) => company.isPaid).length;
    const unpaidCompanies = companies.filter((company) => !company.isPaid).length;
    const totalUsers = companies.reduce((sum, company) => sum + Number(company.userCount || 0), 0);
    return { totalCompanies, activeCompanies, blockedCompanies, trialCompanies, paidCompanies, unpaidCompanies, totalUsers };
  }, [companies]);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await superAdminListCompanies({ limit: 100 });
      setCompanies(response.companies as CompanyRow[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Unable to load companies', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isSystemAdminView) loadCompanies();
  }, [isSystemAdminView, loadCompanies]);

  const runAction = async () => {
    if (!action) return;
    if (reason.trim().length < 8) {
      toast({ variant: 'destructive', title: 'Reason required', description: 'Enter a specific audit reason before changing company access.' });
      return;
    }
    setMutating(true);
    try {
      await superAdminSetCompanyStatus({
        companyId: action.company.companyId,
        ...action.patch,
        reason,
      });
      toast({ title: 'Company updated', description: action.label });
      setAction(null);
      setReason('');
      await loadCompanies();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Status change failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const inviteCompany = async () => {
    setMutating(true);
    try {
      const response = await superAdminInviteCompany({ email: inviteEmail, companyName: inviteCompanyName });
      setInviteToken(response.acceptToken);
      setInviteEmail('');
      setInviteCompanyName('');
      toast({ title: 'Invite created', description: response.email });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Invite failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const confirmManualPayment = async () => {
    if (!manualCompany) return;
    if (!manualAmount || !manualReceipt || manualReason.trim().length < 8) {
      toast({ variant: 'destructive', title: 'Payment details required', description: 'Enter amount, receipt reference, and a specific audit reason.' });
      return;
    }
    setMutating(true);
    try {
      await superAdminConfirmManualPayment({
        companyId: manualCompany.companyId,
        amount: manualAmount,
        currency: manualCurrency,
        periodStart: `${manualPeriodStart}T00:00:00.000Z`,
        periodEnd: `${manualPeriodEnd}T23:59:59.999Z`,
        receiptReference: manualReceipt,
        reason: manualReason,
      });
      toast({ title: 'Manual payment confirmed', description: manualCompany.name || manualCompany.companyId });
      setManualCompany(null);
      setManualAmount('');
      setManualReceipt('');
      setManualReason('');
      await loadCompanies();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Manual payment failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const runExpiryCheck = async () => {
    setMutating(true);
    try {
      const result = await runSubscriptionExpiryCheckNow({ reason: 'manual platform dashboard expiry check' });
      toast({ title: 'Expiry check complete', description: `${result.updated} of ${result.processed} companies updated.` });
      await loadCompanies();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Expiry check failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  if (!isSystemAdminView) {
    return (
      <div className="mx-auto max-w-xl rounded-card border bg-card p-8 text-center shadow-editorialLight">
        <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">System admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">This dashboard is restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform control center</h1>
          <p className="text-sm text-muted-foreground">Companies, subscriptions, locks, and access events.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={runExpiryCheck} disabled={mutating}>
            <CalendarCheck className="mr-2 size-4" />
            Expiry check
          </Button>
          <Button variant="outline" onClick={loadCompanies} disabled={loading}>
            <RefreshCcw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-7">
        {Object.entries(stats).map(([key, value]) => (
          <Card key={key} className="rounded-card shadow-tableDepth">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium capitalize text-muted-foreground">{key.replace(/([A-Z])/g, ' $1')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="financial-nums text-2xl font-semibold">{loading ? <Skeleton className="h-8 w-14" /> : value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-card shadow-tableDepth">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-flowvia-primary" />
            Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : companies.length === 0 ? (
            <div className="rounded-card border border-dashed p-8 text-center text-sm text-muted-foreground">No companies found.</div>
          ) : (
            <div className="overflow-hidden rounded-table border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.companyId}>
                      <TableCell>
                        <button className="text-left font-medium hover:underline" onClick={() => setSelectedCompany(company)}>
                          {company.name || company.companyId}
                        </button>
                        <div className="text-xs text-muted-foreground">{company.companyId}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge(company.subscriptionStatus, company.administrativeLock)}>
                          {company.administrativeLock ? 'blocked' : company.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{company.subscriptionProvider || 'manual'}</TableCell>
                      <TableCell>{company.isPaid ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span className="text-muted-foreground">No</span>}</TableCell>
                      <TableCell className="financial-nums">{company.userCount}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">{company.ownerId || 'Unassigned'}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedCompany(company)}>Open details</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Block company', patch: { administrativeLock: true, forcedSubscriptionStatus: 'blocked', isPaid: false } })}>
                              <Lock className="mr-2 size-4" /> Block
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Unblock company', patch: { administrativeLock: false } })}>
                              <Unlock className="mr-2 size-4" /> Unblock
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Activate subscription', patch: { forcedSubscriptionStatus: 'active', isPaid: true, administrativeLock: false } })}>
                              Activate subscription
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setManualCompany(company)}>
                              <CreditCard className="mr-2 size-4" /> Confirm manual payment
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Set trial', patch: { forcedSubscriptionStatus: 'trialing', isPaid: false, administrativeLock: false, trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() } })}>
                              Set trial
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Mark past due', patch: { forcedSubscriptionStatus: 'past_due', isPaid: false } })}>
                              Mark past due
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAction({ company, label: 'Mark canceled', patch: { forcedSubscriptionStatus: 'canceled', isPaid: false } })}>
                              Mark canceled
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-card shadow-tableDepth">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-flowvia-primary" />
            Invite company owner
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input value={inviteCompanyName} onChange={(event) => setInviteCompanyName(event.target.value)} placeholder="Company name" />
          <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Owner email" type="email" />
          <Button onClick={inviteCompany} disabled={mutating || !inviteCompanyName || !inviteEmail}>Create invite</Button>
          {inviteToken && (
            <div className="md:col-span-3 rounded-card border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              One-time invite token: <span className="financial-nums break-all font-semibold">{inviteToken}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action?.label}</AlertDialogTitle>
            <AlertDialogDescription>
              This changes access for {action?.company.name || action?.company.companyId}. The reason is written to system and tenant audit logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="audit-reason">Audit reason</Label>
            <Input id="audit-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runAction} disabled={mutating}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!selectedCompany} onOpenChange={(open) => !open && setSelectedCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedCompany?.name || 'Company details'}</DialogTitle>
          </DialogHeader>
          {selectedCompany && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Company ID</span><span className="financial-nums text-right">{selectedCompany.companyId}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Owner</span><span className="max-w-[260px] truncate text-right">{selectedCompany.ownerId}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Subscription</span><span>{selectedCompany.subscriptionStatus}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Provider</span><span>{selectedCompany.subscriptionProvider || 'manual'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Administrative lock</span><span>{selectedCompany.administrativeLock ? 'Yes' : 'No'}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Users</span><span className="financial-nums">{selectedCompany.userCount}</span></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!manualCompany} onOpenChange={(open) => !open && setManualCompany(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm manual payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="text-sm text-muted-foreground">{manualCompany?.name || manualCompany?.companyId}</div>
            <div className="grid gap-2">
              <Label htmlFor="manual-amount">Amount</Label>
              <Input id="manual-amount" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} inputMode="decimal" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-currency">Currency</Label>
              <Input id="manual-currency" value={manualCurrency} onChange={(event) => setManualCurrency(event.target.value.toUpperCase())} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="manual-start">Period start</Label>
                <Input id="manual-start" type="date" value={manualPeriodStart} onChange={(event) => setManualPeriodStart(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manual-end">Period end</Label>
                <Input id="manual-end" type="date" value={manualPeriodEnd} onChange={(event) => setManualPeriodEnd(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-receipt">Receipt reference</Label>
              <Input id="manual-receipt" value={manualReceipt} onChange={(event) => setManualReceipt(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manual-reason">Audit reason</Label>
              <Input id="manual-reason" value={manualReason} onChange={(event) => setManualReason(event.target.value)} />
            </div>
            <Button onClick={confirmManualPayment} disabled={mutating}>
              Confirm payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
