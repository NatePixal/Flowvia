import * as crypto from 'crypto';

export type PaymentProvider = 'payme' | 'click' | 'manual' | 'stripe';

export type SubscriptionPaymentResultStatus =
  | 'pending'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'expired'
  | 'inactive'
  | 'blocked'
  | 'confirmed'
  | 'paid'
  | 'succeeded'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'cancelled'
  | 'refunded';

export type SubscriptionCompanyPaymentPatch = {
  isPaid: boolean;
  subscriptionStatus: string;
  administrativeLock: boolean;
  subscriptionAccessLocked: boolean;
};

export const PAYMENT_PROVIDERS: PaymentProvider[] = ['payme', 'click', 'manual', 'stripe'];

export function normalizePaymentProvider(value: unknown, fallback: PaymentProvider = 'manual'): PaymentProvider {
  const provider = String(value || fallback).trim().toLowerCase();
  if (!PAYMENT_PROVIDERS.includes(provider as PaymentProvider)) return fallback;
  return provider as PaymentProvider;
}

export function mapPaymentResultStatus(status: SubscriptionPaymentResultStatus | string): SubscriptionCompanyPaymentPatch {
  const normalized = String(status || '').trim().toLowerCase();
  if (['confirmed', 'paid', 'succeeded', 'success', 'active'].includes(normalized)) {
    return {
      isPaid: true,
      subscriptionStatus: 'active',
      administrativeLock: false,
      subscriptionAccessLocked: false,
    };
  }
  if (normalized === 'trialing') {
    return {
      isPaid: false,
      subscriptionStatus: 'trialing',
      administrativeLock: false,
      subscriptionAccessLocked: false,
    };
  }
  if (normalized === 'pending') {
    return {
      isPaid: false,
      subscriptionStatus: 'unpaid',
      administrativeLock: false,
      subscriptionAccessLocked: true,
    };
  }
  if (['past_due', 'unpaid', 'expired', 'inactive'].includes(normalized)) {
    return {
      isPaid: false,
      subscriptionStatus: normalized,
      administrativeLock: false,
      subscriptionAccessLocked: true,
    };
  }
  if (normalized === 'blocked') {
    return {
      isPaid: false,
      subscriptionStatus: 'blocked',
      administrativeLock: true,
      subscriptionAccessLocked: true,
    };
  }
  if (['canceled', 'cancelled', 'refunded'].includes(normalized)) {
    return {
      isPaid: false,
      subscriptionStatus: normalized === 'refunded' ? 'refunded' : 'canceled',
      administrativeLock: false,
      subscriptionAccessLocked: true,
    };
  }
  return {
    isPaid: false,
    subscriptionStatus: 'unpaid',
    administrativeLock: false,
    subscriptionAccessLocked: true,
  };
}

export function buildClickSignString(input: {
  clickTransId: string;
  serviceId: string;
  secretKey: string;
  merchantTransId: string;
  merchantPrepareId?: string;
  amount: string;
  action: string;
  signTime: string;
}): string {
  const base = input.merchantPrepareId === undefined
    ? `${input.clickTransId}${input.serviceId}${input.secretKey}${input.merchantTransId}${input.amount}${input.action}${input.signTime}`
    : `${input.clickTransId}${input.serviceId}${input.secretKey}${input.merchantTransId}${input.merchantPrepareId}${input.amount}${input.action}${input.signTime}`;
  return crypto.createHash('md5').update(base).digest('hex');
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function safeProviderDocumentId(provider: PaymentProvider, value: string, suffix?: string): string {
  const safeValue = value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 180);
  const safeSuffix = suffix ? `_${suffix.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 40)}` : '';
  return `${provider}_${safeValue}${safeSuffix}`;
}
