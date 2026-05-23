'use client';

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app as firebaseApp } from '@/firebase/client';

const fns = getFunctions(firebaseApp, 'us-central1');

async function callFn<TReq extends object, TRes = any>(name: string, payload: TReq): Promise<TRes> {
  const fn = httpsCallable<TReq, TRes>(fns, name);
  const res = await fn(payload);
  return res.data;
}

/* ================= TAX / INVOICES ================= */

export function ensureTaxSettingsExists(input: {
  companyId: string;
  country: 'AE' | 'SA' | 'JO' | 'EG' | 'UZ';
  force?: boolean;
  overrides?: Record<string, any>;
}) {
  return callFn<typeof input>('ensureTaxSettingsExists', input);
}

export function issueInvoiceForSale(input: {
  companyId: string;
  saleId: string;
}) {
  return callFn<typeof input>('issueInvoiceForSale', input);
}

export function generateInvoicePrintable(input: {
  companyId: string;
  invoiceId: string;
}) {
  return callFn<typeof input, { success: boolean; storagePath: string; format: 'pdf'; downloadUrl?: string; expiresAt?: string }>('generateInvoicePdf', input);
}

export function generateVatReturn(input: {
  companyId: string;
  period: string; // YYYY-MM
}) {
  return callFn<typeof input>('generateVatReturn', input);
}

export function createSalesAdjustment(input: {
  companyId: string;
  saleId: string;
  grossAdjustmentMinor: number;
  reason: string;
}) {
  return callFn<typeof input>('createSalesAdjustment', input);
}

export function computeCompanyAnalytics(input: {
  companyId: string;
}) {
  return callFn<typeof input, { success: boolean; analytics: Record<string, any> }>('computeCompanyAnalytics', input);
}

export function superAdminListCompanies(input: {
  limit?: number;
  pageToken?: string | null;
}) {
  return callFn<typeof input, { companies: any[]; nextPageToken: string | null }>('superAdminListCompanies', input);
}

export function superAdminGetPlatformAnalytics(input: Record<string, never> = {}) {
  return callFn<typeof input, {
    generatedAt: string;
    totals: Record<string, number>;
    byStatus: Record<string, number>;
    byProvider: Record<string, number>;
    revenueByCurrency: Record<string, number>;
    latestCompanyRegistrations: any[];
    latestPaymentEvents: any[];
    latestPaymentIntents: any[];
    latestSystemAuditLogs: any[];
  }>('superAdminGetPlatformAnalytics', input);
}

export function superAdminSetCompanyStatus(input: {
  companyId: string;
  administrativeLock?: boolean;
  forcedSubscriptionStatus?: string;
  isPaid?: boolean;
  trialEndsAt?: string | null;
  reason: string;
}) {
  return callFn<typeof input, { success: boolean; companyId: string; status: Record<string, any> }>('superAdminSetCompanyStatus', input);
}

export function superAdminInviteCompany(input: {
  email: string;
  companyName: string;
  ownerName?: string;
}) {
  return callFn<typeof input, { inviteId: string; email: string; companyName: string; expiresAt: string; acceptToken: string }>('superAdminInviteCompany', input);
}

export function createSubscriptionPaymentIntent(input: {
  companyId: string;
  provider?: 'payme' | 'click' | 'manual' | 'stripe';
  amount?: number | string;
  amountMinor?: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
}) {
  return callFn<typeof input, {
    intentId: string;
    companyId: string;
    provider: string;
    amountMinor: number;
    currency: string;
    periodStart: string;
    periodEnd: string;
    expiresAt: string;
  }>('createSubscriptionPaymentIntent', input);
}

export function superAdminConfirmManualPayment(input: {
  companyId: string;
  amount?: number | string;
  amountMinor?: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
  reason: string;
  receiptReference: string;
}) {
  return callFn<typeof input, { success: boolean; companyId: string; provider: string; subscriptionStatus: string }>('superAdminConfirmManualPayment', input);
}

export function runSubscriptionExpiryCheckNow(input: {
  reason?: string;
}) {
  return callFn<typeof input, { success: boolean; processed: number; updated: number }>('runSubscriptionExpiryCheckNow', input);
}

export function backfillCompanyMembersFromUsers(input: {
  dryRun: boolean;
  limit?: number;
  pageToken?: string | null;
}) {
  return callFn<typeof input, {
    success: boolean;
    dryRun: boolean;
    processed: number;
    toCreate: number;
    existing: number;
    skipped: number;
    errors: Array<{ uid: string; reason: string }>;
    nextPageToken: string | null;
  }>('backfillCompanyMembersFromUsers', input);
}

export function createCompanyMemberInvite(input: {
  companyId: string;
  email: string;
  role: string;
}) {
  return callFn<typeof input, { inviteId: string; email: string; role: string; expiresAt: string; acceptToken: string }>('createCompanyMemberInvite', input);
}

/* ================= AGRI ================= */

export function createHarvestBatch(input: {
  companyId: string;
  seasonId: string;
  fieldId: string;
  harvestDate?: string;
  qty: number;
  unit?: string;
  grade?: string;
  crop?: string;
  storageLocation?: string | null;
}) {
  return callFn<typeof input>('createHarvestBatch', input);
}

export function recordAgriConsumption(input: {
  companyId: string;
  seasonId: string;
  fieldId: string;
  date?: string;
  decrementInventory?: boolean;
  lines: Array<{
    productId: string;
    qty: number;
    unit?: string;
    name?: string;
  }>;
}) {
  return callFn<typeof input>('recordAgriConsumption', input);
}

export function confirmSettlement(input: {
  companyId: string;
  saleId: string;
  date?: string;
  deductions: Array<{
    type: string;
    amountMinor: number;
    note?: string;
  }>;
}) {
  return callFn<typeof input>('confirmSettlement', input);
}

export function exportSeasonPnl(input: {
  companyId: string;
  seasonId: string;
}) {
  return callFn<typeof input>('exportSeasonPnl', input);
}
