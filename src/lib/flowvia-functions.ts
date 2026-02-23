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
  country: 'AE' | 'SA' | 'JO' | 'EG';
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
