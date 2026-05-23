'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ElementType } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CreditCard,
  DatabaseZap,
  Lock,
  RefreshCcw,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { CURRENCY_DECIMALS } from '@/lib/currency-config';
import {
  backfillCompanyMembersFromUsers,
  runSubscriptionExpiryCheckNow,
  superAdminConfirmManualPayment,
  superAdminGetPlatformAnalytics,
  superAdminListCompanies,
  superAdminSetCompanyStatus,
} from '@/lib/flowvia-functions';

type CompanyRow = {
  companyId: string;
  name: string;
  ownerId: string | null;
  subscriptionStatus: string;
  subscriptionProvider?: string | null;
  isPaid: boolean;
  administrativeLock: boolean;
  userCount: number;
};

type PlatformAnalytics = Awaited<ReturnType<typeof superAdminGetPlatformAnalytics>>;

const navItems = [
  { value: 'overview', label: 'Overview', icon: BarChart3 },
  { value: 'companies', label: 'Companies', icon: Building2 },
  { value: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { value: 'access', label: 'Access', icon: UserCog },
  { value: 'audit', label: 'Audit logs', icon: Activity },
  { value: 'communications', label: 'Communications', icon: Bell },
];

function formatMinor(minor: number, currency: string) {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const value = Number(minor || 0) / 10 ** decimals;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${value.toFixed(decimals)} ${currency}`;
  }
}

function formatDate(value: unknown) {
  if (!value) return 'Not recorded';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function statusClass(status: string, locked?: boolean) {
  if (locked || status === 'blocked') return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
  if (status === 'active') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'trialing') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  return 'border-slate-400/30 bg-slate-500/10 text-slate-700 dark:text-slate-300';
}

function MetricTile({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: ElementType;
}) {
  return (
    <Card className="rounded-lg border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="financial-nums mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
          {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
      <p className="font-medium text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

export default function SuperAdminControlPanel() {
  const { toast } = useToast();
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [manualCompany, setManualCompany] = useState<CompanyRow | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [manualCurrency, setManualCurrency] = useState('UZS');
  const [manualPeriodStart, setManualPeriodStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualPeriodEnd, setManualPeriodEnd] = useState(() => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [manualReceipt, setManualReceipt] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [backfillResult, setBackfillResult] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsResponse, companiesResponse] = await Promise.all([
        superAdminGetPlatformAnalytics(),
        superAdminListCompanies({ limit: 100 }),
      ]);
      setAnalytics(analyticsResponse);
      setCompanies(companiesResponse.companies as CompanyRow[]);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Unable to load platform analytics', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = analytics?.totals ?? {};
  const revenueRows = useMemo(() => Object.entries(analytics?.revenueByCurrency ?? {}), [analytics]);
  const statusRows = useMemo(() => Object.entries(analytics?.byStatus ?? {}).sort((a, b) => b[1] - a[1]), [analytics]);
  const providerRows = useMemo(() => Object.entries(analytics?.byProvider ?? {}).sort((a, b) => b[1] - a[1]), [analytics]);

  const confirmManualPayment = async () => {
    if (!manualCompany) return;
    if (!manualAmount || !manualReceipt || manualReason.trim().length < 8) {
      toast({ variant: 'destructive', title: 'Payment details required', description: 'Amount, receipt reference, and audit reason are required.' });
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
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Manual payment failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const updateCompanyStatus = async (company: CompanyRow, label: string, patch: Record<string, unknown>) => {
    const reason = window.prompt(`Audit reason for: ${label}`);
    if (!reason || reason.trim().length < 8) {
      toast({ variant: 'destructive', title: 'Audit reason required', description: 'Use at least 8 characters.' });
      return;
    }
    setMutating(true);
    try {
      await superAdminSetCompanyStatus({ companyId: company.companyId, reason, ...patch });
      toast({ title: 'Company updated', description: label });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Status update failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const runExpiryCheck = async () => {
    setMutating(true);
    try {
      const result = await runSubscriptionExpiryCheckNow({ reason: 'manual super-admin control panel expiry check' });
      toast({ title: 'Expiry check complete', description: `${result.updated} of ${result.processed} companies updated.` });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Expiry check failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  const runBackfill = async (dryRun: boolean) => {
    setMutating(true);
    try {
      const result = await backfillCompanyMembersFromUsers({ dryRun, limit: 200 });
      setBackfillResult(result);
      toast({ title: dryRun ? 'Backfill dry run complete' : 'Backfill completed', description: `${result.toCreate} memberships to create.` });
      await load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Backfill failed', description: error.message });
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f9fb] text-slate-950 dark:bg-[#0b0f19] dark:text-slate-50">
      <Tabs defaultValue="overview" className="flex min-h-screen">
        <aside className="hidden w-[280px] shrink-0 border-r border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950 md:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">FlowVia Admin</h1>
              <p className="text-xs text-slate-500">System Control</p>
            </div>
          </div>
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-transparent p-0">
            {navItems.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="justify-start gap-3 rounded-lg px-3 py-2 data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-500/10 dark:data-[state=active]:text-indigo-300">
                <item.icon className="size-4" />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Separate super-admin route</p>
              <h2 className="text-xl font-semibold">Subscription Control Panel</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={runExpiryCheck} disabled={mutating}>
                <CalendarCheck className="mr-2 size-4" />
                Expiry check
              </Button>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCcw className="mr-2 size-4" />
                Refresh
              </Button>
            </div>
          </header>

          <div className="p-5 md:p-8">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <div>
                <h3 className="text-3xl font-semibold tracking-tight">Advanced analytics</h3>
                <p className="mt-1 text-sm text-slate-500">Live platform health from companies, users, payment events, and audit logs.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile title="Companies" value={totals.totalCompanies ?? 0} icon={Building2} description={`${totals.activeCompanies ?? 0} active`} />
                <MetricTile title="Users" value={totals.totalUsers ?? 0} icon={Users} description={`${totals.totalSystemAdmins ?? 0} system admins`} />
                <MetricTile title="Paid companies" value={totals.paidCompanies ?? 0} icon={CheckCircle2} description={`${totals.unpaidCompanies ?? 0} unpaid`} />
                <MetricTile title="Blocked" value={totals.blockedCompanies ?? 0} icon={Lock} description={`${totals.trialCompanies ?? 0} trials`} />
              </div>
              <div className="grid gap-4 xl:grid-cols-3">
                <Card className="rounded-lg xl:col-span-2">
                  <CardHeader>
                    <CardTitle>Status distribution</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {statusRows.length === 0 ? <EmptyState title="No status data" description="Company subscription statuses will appear after companies exist." /> : statusRows.map(([status, count]) => {
                      const total = Math.max(Number(totals.totalCompanies || 0), 1);
                      return (
                        <div key={status}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="capitalize">{status}</span>
                            <span className="financial-nums">{count}</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                            <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${Math.min(100, (count / total) * 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardHeader>
                    <CardTitle>Revenue captured</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {revenueRows.length === 0 ? <EmptyState title="No confirmed payments" description="Payme, Click, manual, or Stripe payments will appear here after confirmation." /> : revenueRows.map(([currency, minor]) => (
                      <div key={currency} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="font-medium">{currency}</span>
                        <span className="financial-nums font-semibold">{formatMinor(Number(minor), currency)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="companies" className="mt-0 space-y-4">
              <h3 className="text-2xl font-semibold">Companies</h3>
              <Card className="rounded-lg">
                <CardContent className="p-0">
                  <ScrollArea className="w-full">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {companies.map((company) => (
                          <TableRow key={company.companyId}>
                            <TableCell>
                              <div className="font-medium">{company.name || company.companyId}</div>
                              <div className="text-xs text-slate-500">{company.companyId}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusClass(company.subscriptionStatus, company.administrativeLock)}>
                                {company.administrativeLock ? 'blocked' : company.subscriptionStatus}
                              </Badge>
                            </TableCell>
                            <TableCell>{company.subscriptionProvider || 'manual'}</TableCell>
                            <TableCell className="financial-nums">{company.userCount}</TableCell>
                            <TableCell className="space-x-2 text-right">
                              <Button size="sm" variant="outline" onClick={() => setManualCompany(company)}>Manual payment</Button>
                              <Button size="sm" variant="outline" onClick={() => updateCompanyStatus(company, 'Unblock company', { administrativeLock: false })}>Unblock</Button>
                              <Button size="sm" variant="destructive" onClick={() => updateCompanyStatus(company, 'Block company', { administrativeLock: true, forcedSubscriptionStatus: 'blocked', isPaid: false })}>Block</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="subscriptions" className="mt-0 space-y-4">
              <h3 className="text-2xl font-semibold">Subscriptions and providers</h3>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="rounded-lg">
                  <CardHeader><CardTitle>Provider mix</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {providerRows.length === 0 ? <EmptyState title="No provider data" description="Companies will be grouped by Payme, Click, manual, or Stripe." /> : providerRows.map(([provider, count]) => (
                      <div key={provider} className="flex items-center justify-between rounded-lg border p-3">
                        <span className="capitalize">{provider}</span>
                        <span className="financial-nums font-semibold">{count}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card className="rounded-lg">
                  <CardHeader><CardTitle>Latest payment events</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {(analytics?.latestPaymentEvents ?? []).length === 0 ? <EmptyState title="No payment events" description="Confirmed provider callbacks and manual confirmations will appear here." /> : analytics?.latestPaymentEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{event.provider || 'provider'}</span>
                          <Badge variant="outline" className={statusClass(event.subscriptionStatus || event.status)}>{event.status}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">{event.companyId}</div>
                        <div className="financial-nums mt-2 text-sm">{formatMinor(Number(event.amountMinor || 0), event.currency || 'UZS')}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="access" className="mt-0 space-y-4">
              <h3 className="text-2xl font-semibold">Access control and migration</h3>
              <div className="grid gap-4 xl:grid-cols-3">
                <MetricTile title="System admins" value={totals.totalSystemAdmins ?? 0} icon={ShieldCheck} description="Stored in /systemAdmins" />
                <MetricTile title="Users" value={totals.totalUsers ?? 0} icon={Users} description="Profiles in /users" />
                <MetricTile title="Pending intents" value={totals.pendingPaymentIntents ?? 0} icon={AlertTriangle} description="Created payment intents not yet confirmed" />
              </div>
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><DatabaseZap className="size-5" /> Company member backfill</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-500">Run dry-run first. Live backfill creates missing /companies/companyId/members/uid records from existing /users profiles.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => runBackfill(true)} disabled={mutating}>Dry run</Button>
                    <Button onClick={() => runBackfill(false)} disabled={mutating}>Run live backfill</Button>
                  </div>
                  {backfillResult && (
                    <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">{JSON.stringify(backfillResult, null, 2)}</pre>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="audit" className="mt-0 space-y-4">
              <h3 className="text-2xl font-semibold">Master audit log</h3>
              <Card className="rounded-lg">
                <CardContent className="p-0">
                  {(analytics?.latestSystemAuditLogs ?? []).length === 0 ? (
                    <div className="p-6"><EmptyState title="No audit logs" description="System audit events will appear after administrative actions run." /></div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics?.latestSystemAuditLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="financial-nums">{formatDate(log.createdAt)}</TableCell>
                            <TableCell>{log.actorUid || 'system'}</TableCell>
                            <TableCell>{log.action || 'event'}</TableCell>
                            <TableCell className="max-w-md truncate text-slate-500">{log.reason || 'No reason recorded'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="communications" className="mt-0 space-y-4">
              <h3 className="text-2xl font-semibold">Communications</h3>
              <EmptyState title="No communication events connected" description="The Stitch communications screen is integrated as a real-data surface. Connect email or notification events before sending production broadcasts." />
            </TabsContent>
          </div>
        </main>

        <Dialog open={!!manualCompany} onOpenChange={(open) => !open && setManualCompany(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm manual payment</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="text-sm text-slate-500">{manualCompany?.name || manualCompany?.companyId}</div>
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} inputMode="decimal" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={manualCurrency} onChange={(event) => setManualCurrency(event.target.value.toUpperCase())} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="start">Period start</Label>
                  <Input id="start" type="date" value={manualPeriodStart} onChange={(event) => setManualPeriodStart(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="end">Period end</Label>
                  <Input id="end" type="date" value={manualPeriodEnd} onChange={(event) => setManualPeriodEnd(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receipt">Receipt reference</Label>
                <Input id="receipt" value={manualReceipt} onChange={(event) => setManualReceipt(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Audit reason</Label>
                <Input id="reason" value={manualReason} onChange={(event) => setManualReason(event.target.value)} />
              </div>
              <Button onClick={confirmManualPayment} disabled={mutating}>Confirm payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </div>
  );
}
