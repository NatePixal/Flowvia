import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Currency, PaymentProvider, UserRole } from './types';
import { CURRENCY_DECIMALS } from './currency-config';
import {
  buildClickSignString,
  mapPaymentResultStatus,
  normalizePaymentProvider,
  safeProviderDocumentId,
  SubscriptionPaymentResultStatus,
  timingSafeStringEqual,
} from './payment-core';
import {
  parseBoolean,
  parseCurrency,
  parseNumber,
  parseOptionalDate,
  parseString,
  requireAuthenticated,
  requireSystemAdmin,
  resolveCompanyAccess,
  sanitizeForDocument,
} from './security';

if (!admin.apps.length) {
  admin.initializeApp();
}

let _db: admin.firestore.Firestore | null = null;
const firestore = new Proxy({} as admin.firestore.Firestore, {
  get(target, prop) {
    if (!_db) {
      _db = admin.firestore();
    }
    const value = (_db as any)[prop];
    if (typeof value === 'function') {
      return value.bind(_db);
    }
    return value;
  }
});
const REGION = 'us-central1';
const ADMIN_ROLES: UserRole[] = ['admin', 'developer'];
const FINANCE_ROLES: UserRole[] = ['admin', 'accounting', 'developer'];
const INVITABLE_ROLES: UserRole[] = ['admin', 'manager', 'sales', 'accounting'];
const SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'pending',
  'canceled',
  'cancelled',
  'refunded',
  'incomplete',
  'incomplete_expired',
  'expired',
  'inactive',
  'blocked',
]);

function toBusinessDayFromCreatedAt(value: unknown, tz = 'Asia/Tashkent'): string {
  const source = value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(source);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function businessDayToBusinessDate(businessDay: string): Timestamp {
  return Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
}

async function stampBusinessDate(snap: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const data = snap.data() || {};
  if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return;
  const source = data.date || data.incomeDate || data.createdAt || data.recordedAt;
  const businessDay = toBusinessDayFromCreatedAt(source);
  await snap.ref.set({
    businessDay,
    businessDate: businessDayToBusinessDate(businessDay),
    createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
  }, { merge: true });
}

function getEnvSecret(name: string, configPath?: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  if (configPath) {
    const [group, key] = configPath.split('.');
    const value = (functions.config() as Record<string, Record<string, string> | undefined>)[group]?.[key];
    if (value) return value;
  }
  throw new functions.https.HttpsError('failed-precondition', `${name} is not configured.`);
}

function verifyStripeSignature(rawBody: Buffer, signatureHeader: string, webhookSecret: string): void {
  const timestamp = signatureHeader.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = signatureHeader.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) {
    throw new Error('Malformed Stripe signature header.');
  }
  const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const valid = signatures.some((signature) => {
    const actualBuffer = Buffer.from(signature, 'hex');
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  });
  if (!valid) throw new Error('Invalid Stripe webhook signature.');
}

function stripeSubscriptionStatusToCompany(status: string): { status: string; isPaid: boolean } {
  if (status === 'active') return { status: 'active', isPaid: true };
  if (status === 'trialing') return { status: 'trialing', isPaid: false };
  if (SUBSCRIPTION_STATUSES.has(status)) return { status, isPaid: false };
  return { status: 'inactive', isPaid: false };
}

function extractCompanyIdFromStripeObject(object: Record<string, any>): string | null {
  return (
    object.metadata?.companyId ||
    object.subscription_details?.metadata?.companyId ||
    object.lines?.data?.[0]?.metadata?.companyId ||
    null
  );
}

function extractSubscriptionPayload(event: Record<string, any>) {
  const object = event.data?.object || {};
  const type = String(event.type || '');
  const companyId = extractCompanyIdFromStripeObject(object);
  let status = object.status ? String(object.status) : 'inactive';
  if (type === 'invoice.payment_succeeded') status = 'active';
  if (type === 'invoice.payment_failed') status = object.next_payment_attempt ? 'past_due' : 'unpaid';
  if (type === 'customer.subscription.deleted') status = 'canceled';
  const mapped = stripeSubscriptionStatusToCompany(status);
  return {
    companyId,
    subscriptionId: String(object.subscription || object.id || ''),
    customerId: String(object.customer || ''),
    subscriptionStatus: mapped.status,
    isPaid: mapped.isPaid,
    amountMinor: Number(object.amount_paid ?? object.amount_due ?? object.plan?.amount ?? object.lines?.data?.[0]?.amount ?? 0),
    currency: String(object.currency || 'usd').toUpperCase() as Currency,
    currentPeriodStart: object.current_period_start
      ? Timestamp.fromMillis(Number(object.current_period_start) * 1000)
      : object.lines?.data?.[0]?.period?.start
        ? Timestamp.fromMillis(Number(object.lines.data[0].period.start) * 1000)
        : null,
    currentPeriodEnd: object.current_period_end
      ? Timestamp.fromMillis(Number(object.current_period_end) * 1000)
      : object.lines?.data?.[0]?.period?.end
        ? Timestamp.fromMillis(Number(object.lines.data[0].period.end) * 1000)
        : null,
    cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
  };
}

async function writeSystemAudit(actorUid: string, action: string, targetId: string, before: unknown, after: unknown, reason?: string): Promise<void> {
  await firestore.collection('systemAuditLogs').add({
    actorUid,
    action,
    targetId,
    before: before ?? null,
    after: after ?? null,
    reason: reason ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function writeTenantAudit(companyId: string, actorUid: string, action: string, targetId: string, before: unknown, after: unknown, reason?: string): Promise<void> {
  await firestore.collection(`companies/${companyId}/auditLogs`).add({
    companyId,
    actorUid,
    action,
    entityType: 'COMPANY',
    entityId: targetId,
    before: before ?? null,
    after: after ?? null,
    reason: reason ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function hashInviteToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function assertInvitableRole(role: string): asserts role is UserRole {
  if (!INVITABLE_ROLES.includes(role as UserRole) || role === 'developer') {
    throw new functions.https.HttpsError('invalid-argument', 'Role cannot be invited.');
  }
}

function getOptionalConfig(name: string, configPath?: string): string | null {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv;
  if (configPath) {
    const [group, key] = configPath.split('.');
    const value = (functions.config() as Record<string, Record<string, string> | undefined>)[group]?.[key];
    if (value) return value;
  }
  return null;
}

function getConfiguredPaymentProvider(): PaymentProvider {
  return normalizePaymentProvider(getOptionalConfig('PAYMENT_PROVIDER', 'payment.provider'), 'manual') as PaymentProvider;
}

function requireProviderSecret(name: string, configPath: string, provider: PaymentProvider): string {
  const value = getOptionalConfig(name, configPath);
  if (!value) throw new functions.https.HttpsError('failed-precondition', `${provider} payment configuration is missing ${name}.`);
  return value;
}

function parsePaymentProvider(value: unknown): PaymentProvider {
  const provider = normalizePaymentProvider(value, getConfiguredPaymentProvider());
  if (!['payme', 'click', 'manual', 'stripe'].includes(provider)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported payment provider.');
  }
  return provider as PaymentProvider;
}

function asTimestamp(value: Date | string | number | Timestamp, fieldName: string): Timestamp {
  if (value instanceof Timestamp) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a valid date.`);
  }
  return Timestamp.fromDate(date);
}

function normalizeDateInput(value: unknown, fieldName: string): Timestamp {
  const parsed = parseOptionalDate(value, fieldName);
  if (!parsed) throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required.`);
  return Timestamp.fromDate(parsed);
}

function parseMinorUnits(value: unknown, fieldName: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a positive safe integer minor-unit amount.`);
  }
  return amount;
}

function parseNonNegativeMinorUnits(value: unknown, fieldName: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a non-negative safe integer minor-unit amount.`);
  }
  return amount;
}

function decimalAmountToMinor(value: unknown, currency: Currency): number {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new functions.https.HttpsError('invalid-argument', 'amount must be a positive decimal string or number.');
  }
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  const [whole, fraction = ''] = raw.split('.');
  if (fraction.length > decimals) {
    throw new functions.https.HttpsError('invalid-argument', `amount has too many decimal places for ${currency}.`);
  }
  const padded = fraction.padEnd(decimals, '0');
  const minor = Number(`${whole}${padded}`.replace(/^0+(?=\d)/, ''));
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'amount must be greater than zero.');
  }
  return minor;
}

function paymeAmountToSystemMinor(amount: unknown, currency: Currency): number {
  const providerMinor = parseMinorUnits(amount, 'amount');
  if (currency !== 'UZS') return providerMinor;
  const appDecimals = CURRENCY_DECIMALS.UZS ?? 0;
  if (appDecimals >= 2) return providerMinor;
  const divisor = 10 ** (2 - appDecimals);
  if (providerMinor % divisor !== 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Payme amount must align with configured UZS minor units.');
  }
  return providerMinor / divisor;
}

function firestoreTimestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  const parsed = value instanceof Date ? value : value ? new Date(value as string | number) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

function timestampToIso(value: unknown): string | null {
  const millis = firestoreTimestampMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

function safeEventStatus(status: string): SubscriptionPaymentResultStatus {
  const normalized = status.trim().toLowerCase();
  if ([
    'pending',
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'expired',
    'inactive',
    'blocked',
    'confirmed',
    'paid',
    'succeeded',
    'success',
    'failed',
    'canceled',
    'cancelled',
    'refunded',
  ].includes(normalized)) {
    return normalized as SubscriptionPaymentResultStatus;
  }
  return 'failed';
}

async function getSubscriptionPaymentIntent(intentId: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await firestore.doc(`subscriptionPaymentIntents/${intentId}`).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Subscription payment intent not found.');
  }
  return snap;
}

async function resolveIntentFromProviderInput(input: {
  provider: PaymentProvider;
  merchantTransId?: string;
  account?: Record<string, unknown>;
}): Promise<{ intentId: string; intent: FirebaseFirestore.DocumentData; snap: FirebaseFirestore.DocumentSnapshot }> {
  const rawIntentId =
    input.merchantTransId ||
    (typeof input.account?.intentId === 'string' ? input.account.intentId : '') ||
    (typeof input.account?.subscriptionPaymentIntentId === 'string' ? input.account.subscriptionPaymentIntentId : '') ||
    (typeof input.account?.orderId === 'string' ? input.account.orderId : '') ||
    (typeof input.account?.order_id === 'string' ? input.account.order_id : '');
  const intentId = parseString(rawIntentId, 'subscriptionPaymentIntentId');
  const snap = await getSubscriptionPaymentIntent(intentId);
  const intent = snap.data() || {};
  if (intent.provider && intent.provider !== input.provider) {
    throw new functions.https.HttpsError('failed-precondition', 'Payment intent provider mismatch.');
  }
  if (intent.status === 'paid' || intent.status === 'confirmed') {
    throw new functions.https.HttpsError('failed-precondition', 'Payment intent is already paid.');
  }
  if (intent.expiresAt instanceof Timestamp && intent.expiresAt.toMillis() < Date.now()) {
    throw new functions.https.HttpsError('failed-precondition', 'Payment intent has expired.');
  }
  return { intentId, intent, snap };
}

function validateProviderAmount(intent: FirebaseFirestore.DocumentData, amountMinor: number): void {
  const expected = Number(intent.amountMinor);
  if (!Number.isSafeInteger(expected) || expected <= 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Payment intent amount is invalid.');
  }
  if (expected !== amountMinor) {
    throw new functions.https.HttpsError('failed-precondition', 'Payment amount does not match the subscription intent.');
  }
}

function validateIntentPeriod(intent: FirebaseFirestore.DocumentData): { start: Timestamp; end: Timestamp } {
  const startMillis = firestoreTimestampMillis(intent.periodStart);
  const endMillis = firestoreTimestampMillis(intent.periodEnd);
  if (!startMillis || !endMillis || endMillis <= startMillis) {
    throw new functions.https.HttpsError('failed-precondition', 'Payment intent has an invalid subscription period.');
  }
  return { start: Timestamp.fromMillis(startMillis), end: Timestamp.fromMillis(endMillis) };
}

export async function applySubscriptionPaymentResult(input: {
  companyId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  amountMinor: number;
  currency: Currency;
  status: SubscriptionPaymentResultStatus | string;
  paidAt: Date | string | number | Timestamp;
  periodStart: Date | string | number | Timestamp;
  periodEnd: Date | string | number | Timestamp;
  actorUid?: string;
  rawEvent?: Record<string, unknown>;
}) {
  const companyId = parseString(input.companyId, 'companyId');
  const provider = parsePaymentProvider(input.provider);
  const providerPaymentId = parseString(input.providerPaymentId, 'providerPaymentId');
  const amountMinor = parseNonNegativeMinorUnits(input.amountMinor, 'amountMinor');
  const currency = parseCurrency(input.currency);
  const paidAt = asTimestamp(input.paidAt, 'paidAt');
  const periodStart = asTimestamp(input.periodStart, 'periodStart');
  const periodEnd = asTimestamp(input.periodEnd, 'periodEnd');
  if (periodEnd.toMillis() <= periodStart.toMillis()) {
    throw new functions.https.HttpsError('invalid-argument', 'periodEnd must be after periodStart.');
  }

  const normalizedStatus = safeEventStatus(String(input.status || 'failed'));
  const patch = mapPaymentResultStatus(normalizedStatus);
  const companyRef = firestore.doc(`companies/${companyId}`);
  const eventId = safeProviderDocumentId(provider, providerPaymentId, normalizedStatus);
  const eventRef = firestore.doc(`companies/${companyId}/subscriptionEvents/${eventId}`);
  const systemEventRef = firestore.doc(`paymentProviderEvents/${eventId}`);

  const result = await firestore.runTransaction(async (tx) => {
    const existingEvent = await tx.get(eventRef);
    if (existingEvent.exists) {
      return { idempotent: true, companyId, provider, eventId, subscriptionStatus: existingEvent.data()?.subscriptionStatus ?? patch.subscriptionStatus };
    }
    const companySnap = await tx.get(companyRef);
    if (!companySnap.exists) throw new functions.https.HttpsError('not-found', 'Company not found.');
    const companyBefore = companySnap.data() || {};
    const shouldMutateCompany =
      patch.isPaid === true ||
      !companyBefore.subscriptionId ||
      companyBefore.subscriptionId === providerPaymentId ||
      companyBefore.subscriptionProvider === provider;

    tx.set(eventRef, {
      companyId,
      provider,
      providerPaymentId,
      amountMinor,
      currency,
      status: normalizedStatus,
      subscriptionStatus: patch.subscriptionStatus,
      paidAt,
      periodStart,
      periodEnd,
      rawEvent: input.rawEvent ?? null,
      processedAt: FieldValue.serverTimestamp(),
    });
    tx.set(systemEventRef, {
      companyId,
      provider,
      providerPaymentId,
      amountMinor,
      currency,
      status: normalizedStatus,
      subscriptionStatus: patch.subscriptionStatus,
      processedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (shouldMutateCompany) {
      tx.set(companyRef, {
        isPaid: patch.isPaid,
        subscriptionStatus: patch.subscriptionStatus,
        subscriptionProvider: provider,
        subscriptionId: providerPaymentId,
        subscriptionPeriodStart: periodStart,
        subscriptionPeriodEnd: periodEnd,
        lastPaymentAt: paidAt,
        administrativeLock: patch.administrativeLock,
        subscriptionAccessLocked: patch.subscriptionAccessLocked,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return { idempotent: false, companyId, provider, eventId, subscriptionStatus: patch.subscriptionStatus };
  });

  if (!result.idempotent) {
    await writeSystemAudit(input.actorUid || provider, 'APPLY_SUBSCRIPTION_PAYMENT_RESULT', companyId, null, {
      provider,
      providerPaymentId,
      amountMinor,
      currency,
      status: normalizedStatus,
      subscriptionStatus: patch.subscriptionStatus,
    }, `payment provider ${provider}`);
    await writeTenantAudit(companyId, input.actorUid || provider, 'APPLY_SUBSCRIPTION_PAYMENT_RESULT', providerPaymentId, null, {
      provider,
      amountMinor,
      currency,
      status: normalizedStatus,
      subscriptionStatus: patch.subscriptionStatus,
    }, `payment provider ${provider}`);
  }
  return result;
}

export const createSubscriptionPaymentIntent = functions.region(REGION).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const provider = data?.provider === undefined ? getConfiguredPaymentProvider() : parsePaymentProvider(data.provider);
  if (provider === 'manual') {
    await requireSystemAdmin(requireAuthenticated(context).uid);
  } else {
    await resolveCompanyAccess(context, companyId, ['admin', 'accounting', 'developer'], {
      allowInactiveSubscription: true,
    });
  }

  const currency = parseCurrency(data?.currency || 'UZS');
  const amountMinor = data?.amountMinor !== undefined
    ? parseMinorUnits(data.amountMinor, 'amountMinor')
    : decimalAmountToMinor(data?.amount, currency);
  const periodStart = normalizeDateInput(data?.periodStart, 'periodStart');
  const periodEnd = normalizeDateInput(data?.periodEnd, 'periodEnd');
  if (periodEnd.toMillis() <= periodStart.toMillis()) {
    throw new functions.https.HttpsError('invalid-argument', 'periodEnd must be after periodStart.');
  }

  const companySnap = await firestore.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) throw new functions.https.HttpsError('not-found', 'Company not found.');

  const intentRef = firestore.collection('subscriptionPaymentIntents').doc();
  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  await intentRef.set({
    companyId,
    provider,
    amountMinor,
    currency,
    periodStart,
    periodEnd,
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: context.auth?.uid || 'system',
    expiresAt,
  });
  await writeTenantAudit(companyId, context.auth?.uid || 'system', 'CREATE_SUBSCRIPTION_PAYMENT_INTENT', intentRef.id, null, {
    provider,
    amountMinor,
    currency,
    periodStart,
    periodEnd,
  }, 'subscription payment intent');
  return {
    intentId: intentRef.id,
    companyId,
    provider,
    amountMinor,
    currency,
    periodStart: periodStart.toDate().toISOString(),
    periodEnd: periodEnd.toDate().toISOString(),
    expiresAt: expiresAt.toDate().toISOString(),
  };
});

export const superAdminConfirmManualPayment = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const companyId = parseString(data?.companyId, 'companyId');
  const currency = parseCurrency(data?.currency || 'UZS');
  const amountMinor = data?.amountMinor !== undefined
    ? parseMinorUnits(data.amountMinor, 'amountMinor')
    : decimalAmountToMinor(data?.amount, currency);
  const periodStart = normalizeDateInput(data?.periodStart, 'periodStart');
  const periodEnd = normalizeDateInput(data?.periodEnd, 'periodEnd');
  const reason = sanitizeForDocument(parseString(data?.reason, 'reason'), 500);
  const receiptReference = sanitizeForDocument(parseString(data?.receiptReference, 'receiptReference'), 180);
  if (periodEnd.toMillis() <= periodStart.toMillis()) {
    throw new functions.https.HttpsError('invalid-argument', 'periodEnd must be after periodStart.');
  }
  const providerPaymentId = `manual_${receiptReference}_${Date.now()}`.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  const result = await applySubscriptionPaymentResult({
    companyId,
    provider: 'manual',
    providerPaymentId,
    amountMinor,
    currency,
    status: 'confirmed',
    paidAt: Timestamp.now(),
    periodStart,
    periodEnd,
    actorUid: auth.uid,
    rawEvent: { receiptReference, reason },
  });
  await writeSystemAudit(auth.uid, 'SUPER_ADMIN_CONFIRM_MANUAL_PAYMENT', companyId, null, {
    amountMinor,
    currency,
    periodStart,
    periodEnd,
    receiptReference,
  }, reason);
  await writeTenantAudit(companyId, auth.uid, 'SUPER_ADMIN_CONFIRM_MANUAL_PAYMENT', providerPaymentId, null, {
    amountMinor,
    currency,
    periodStart,
    periodEnd,
    receiptReference,
  }, reason);
  return { success: true, ...result };
});

function paymeError(id: unknown, code: number, message: string, data?: string) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message: { en: message, ru: message, uz: message },
      data: data ?? null,
    },
  };
}

function paymeResult(id: unknown, result: Record<string, unknown>) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function verifyPaymeAuthorization(req: functions.https.Request): void {
  const secret = requireProviderSecret('PAYME_SECRET_KEY', 'payme.secret_key', 'payme');
  const merchantId = getOptionalConfig('PAYME_MERCHANT_ID', 'payme.merchant_id');
  const header = req.header('authorization') || '';
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) throw new functions.https.HttpsError('permission-denied', 'Missing Payme authorization.');
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const [login, password] = decoded.split(':');
  const loginOk = login === 'Paycom' || (merchantId ? login === merchantId : false);
  const passwordOk = password ? timingSafeStringEqual(password, secret) : false;
  if (!loginOk || !passwordOk) throw new functions.https.HttpsError('permission-denied', 'Invalid Payme authorization.');
}

function paymeTransactionResponse(tx: FirebaseFirestore.DocumentData) {
  return {
    create_time: Number(tx.create_time || 0),
    perform_time: Number(tx.perform_time || 0),
    cancel_time: Number(tx.cancel_time || 0),
    transaction: String(tx.transaction || tx.providerPaymentId || ''),
    state: Number(tx.state || 0),
    reason: tx.reason ?? null,
  };
}

export const paymeMerchantWebhook = functions.region(REGION).https.onRequest(async (req, res) => {
  const id = req.body?.id ?? null;
  if (req.method !== 'POST') {
    res.status(200).json(paymeError(id, -32300, 'Only POST requests are supported.'));
    return;
  }

  try {
    verifyPaymeAuthorization(req);
    const method = parseString(req.body?.method, 'method');
    const params = (req.body?.params && typeof req.body.params === 'object') ? req.body.params as Record<string, any> : {};

    if (method === 'CheckPerformTransaction') {
      const account = (params.account && typeof params.account === 'object') ? params.account as Record<string, unknown> : {};
      const { intent, intentId } = await resolveIntentFromProviderInput({ provider: 'payme', account });
      const currency = parseCurrency(intent.currency || 'UZS');
      const amountMinor = paymeAmountToSystemMinor(params.amount, currency);
      validateProviderAmount(intent, amountMinor);
      validateIntentPeriod(intent);
      res.status(200).json(paymeResult(id, { allow: true, additional: { subscriptionPaymentIntentId: intentId } }));
      return;
    }

    if (method === 'CreateTransaction') {
      const providerPaymentId = parseString(params.id, 'params.id');
      const eventRef = firestore.doc(`paymentProviderTransactions/${safeProviderDocumentId('payme', providerPaymentId)}`);
      const account = (params.account && typeof params.account === 'object') ? params.account as Record<string, unknown> : {};
      const { intent, intentId } = await resolveIntentFromProviderInput({ provider: 'payme', account });
      const currency = parseCurrency(intent.currency || 'UZS');
      const amountMinor = paymeAmountToSystemMinor(params.amount, currency);
      validateProviderAmount(intent, amountMinor);
      const period = validateIntentPeriod(intent);
      const createTime = Number(params.time || Date.now());
      const txData = await firestore.runTransaction(async (tx) => {
        const existing = await tx.get(eventRef);
        if (existing.exists) {
          const existingData = existing.data() || {};
          if (existingData.intentId !== intentId || Number(existingData.amountMinor) !== amountMinor) {
            throw new functions.https.HttpsError('failed-precondition', 'Payme transaction parameters changed.');
          }
          return existingData;
        }
        tx.set(eventRef, {
          provider: 'payme',
          providerPaymentId,
          transaction: providerPaymentId,
          intentId,
          companyId: intent.companyId,
          amountMinor,
          currency,
          periodStart: period.start,
          periodEnd: period.end,
          create_time: createTime,
          perform_time: 0,
          cancel_time: 0,
          state: 1,
          reason: null,
          account,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(firestore.doc(`subscriptionPaymentIntents/${intentId}`), {
          status: 'created',
          providerPaymentId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
          providerPaymentId,
          transaction: providerPaymentId,
          create_time: createTime,
          perform_time: 0,
          cancel_time: 0,
          state: 1,
          reason: null,
        };
      });
      res.status(200).json(paymeResult(id, paymeTransactionResponse(txData)));
      return;
    }

    if (method === 'PerformTransaction') {
      const providerPaymentId = parseString(params.id, 'params.id');
      const eventRef = firestore.doc(`paymentProviderTransactions/${safeProviderDocumentId('payme', providerPaymentId)}`);
      const now = Date.now();
      const txSnap = await eventRef.get();
      if (!txSnap.exists) {
        res.status(200).json(paymeError(id, -31003, 'Transaction not found.', 'transaction'));
        return;
      }
      const txData = txSnap.data() || {};
      if (Number(txData.state) === 2) {
        res.status(200).json(paymeResult(id, paymeTransactionResponse(txData)));
        return;
      }
      if (Number(txData.state) < 0) {
        res.status(200).json(paymeError(id, -31008, 'Transaction cannot be performed.'));
        return;
      }
      await applySubscriptionPaymentResult({
        companyId: parseString(txData.companyId, 'companyId'),
        provider: 'payme',
        providerPaymentId,
        amountMinor: parseMinorUnits(txData.amountMinor, 'amountMinor'),
        currency: parseCurrency(txData.currency || 'UZS'),
        status: 'confirmed',
        paidAt: Timestamp.fromMillis(now),
        periodStart: txData.periodStart,
        periodEnd: txData.periodEnd,
        rawEvent: { method, params },
      });
      await eventRef.set({ state: 2, perform_time: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await firestore.doc(`subscriptionPaymentIntents/${txData.intentId}`).set({ status: 'paid', paidAt: FieldValue.serverTimestamp() }, { merge: true });
      const fresh = (await eventRef.get()).data() || {};
      res.status(200).json(paymeResult(id, paymeTransactionResponse(fresh)));
      return;
    }

    if (method === 'CancelTransaction') {
      const providerPaymentId = parseString(params.id, 'params.id');
      const eventRef = firestore.doc(`paymentProviderTransactions/${safeProviderDocumentId('payme', providerPaymentId)}`);
      const txSnap = await eventRef.get();
      if (!txSnap.exists) {
        res.status(200).json(paymeError(id, -31003, 'Transaction not found.', 'transaction'));
        return;
      }
      const txData = txSnap.data() || {};
      const currentState = Number(txData.state || 0);
      const cancelState = currentState === 2 ? -2 : -1;
      const cancelTime = Number(txData.cancel_time || 0) || Date.now();
      await eventRef.set({
        state: cancelState,
        cancel_time: cancelTime,
        reason: params.reason ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (currentState === 2) {
        await applySubscriptionPaymentResult({
          companyId: parseString(txData.companyId, 'companyId'),
          provider: 'payme',
          providerPaymentId,
          amountMinor: parseMinorUnits(txData.amountMinor, 'amountMinor'),
          currency: parseCurrency(txData.currency || 'UZS'),
          status: 'canceled',
          paidAt: Timestamp.fromMillis(cancelTime),
          periodStart: txData.periodStart,
          periodEnd: txData.periodEnd,
          rawEvent: { method, params },
        });
      }
      const fresh = (await eventRef.get()).data() || {};
      res.status(200).json(paymeResult(id, paymeTransactionResponse(fresh)));
      return;
    }

    if (method === 'CheckTransaction') {
      const providerPaymentId = parseString(params.id, 'params.id');
      const txSnap = await firestore.doc(`paymentProviderTransactions/${safeProviderDocumentId('payme', providerPaymentId)}`).get();
      if (!txSnap.exists) {
        res.status(200).json(paymeError(id, -31003, 'Transaction not found.', 'transaction'));
        return;
      }
      res.status(200).json(paymeResult(id, paymeTransactionResponse(txSnap.data() || {})));
      return;
    }

    if (method === 'GetStatement') {
      const from = Number(params.from || 0);
      const to = Number(params.to || Date.now());
      const snap = await firestore.collection('paymentProviderTransactions')
        .where('provider', '==', 'payme')
        .where('create_time', '>=', from)
        .where('create_time', '<=', to)
        .limit(1000)
        .get();
      const transactions = snap.docs.map((doc) => paymeTransactionResponse(doc.data()));
      res.status(200).json(paymeResult(id, { transactions }));
      return;
    }

    res.status(200).json(paymeError(id, -32601, 'Payme method not found.', method));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payme processing failed.';
    functions.logger.error('[paymeMerchantWebhook]', message);
    const code = error instanceof functions.https.HttpsError && error.code === 'permission-denied' ? -32504 : -31050;
    res.status(200).json(paymeError(id, code, message));
  }
});

function parseClickBody(req: functions.https.Request): Record<string, string> {
  const source = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  }
  return out;
}

function clickResponse(input: {
  clickTransId: string;
  merchantTransId: string;
  merchantPrepareId?: string;
  merchantConfirmId?: string;
  error: number;
  errorNote: string;
}) {
  const response: Record<string, unknown> = {
    click_trans_id: input.clickTransId,
    merchant_trans_id: input.merchantTransId,
    error: input.error,
    error_note: input.errorNote,
  };
  if (input.merchantPrepareId) response.merchant_prepare_id = input.merchantPrepareId;
  if (input.merchantConfirmId) response.merchant_confirm_id = input.merchantConfirmId;
  return response;
}

export const clickMerchantWebhook = functions.region(REGION).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: -8, error_note: 'Only POST requests are supported.' });
    return;
  }
  const body = parseClickBody(req);
  const clickTransId = body.click_trans_id || '';
  const merchantTransId = body.merchant_trans_id || '';
  const action = body.action || '';
  try {
    const serviceId = requireProviderSecret('CLICK_SERVICE_ID', 'click.service_id', 'click');
    const secretKey = requireProviderSecret('CLICK_SECRET_KEY', 'click.secret_key', 'click');
    const configuredMerchantId = getOptionalConfig('CLICK_MERCHANT_ID', 'click.merchant_id');
    if (configuredMerchantId && body.merchant_id && body.merchant_id !== configuredMerchantId) {
      res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -5, errorNote: 'Invalid merchant.' }));
      return;
    }
    if (body.service_id !== serviceId) {
      res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -5, errorNote: 'Invalid service.' }));
      return;
    }
    const expected = buildClickSignString({
      clickTransId,
      serviceId: body.service_id,
      secretKey,
      merchantTransId,
      merchantPrepareId: action === '1' ? body.merchant_prepare_id : undefined,
      amount: body.amount,
      action,
      signTime: body.sign_time,
    });
    if (!body.sign_string || !timingSafeStringEqual(body.sign_string.toLowerCase(), expected.toLowerCase())) {
      res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -1, errorNote: 'SIGN CHECK FAILED!' }));
      return;
    }

    const { intent, intentId } = await resolveIntentFromProviderInput({ provider: 'click', merchantTransId });
    const currency = parseCurrency(intent.currency || 'UZS');
    const amountMinor = decimalAmountToMinor(body.amount, currency);
    validateProviderAmount(intent, amountMinor);
    const period = validateIntentPeriod(intent);

    if (action === '0') {
      const prepareId = safeProviderDocumentId('click', clickTransId, 'prepare');
      const txRef = firestore.doc(`paymentProviderTransactions/${prepareId}`);
      await firestore.runTransaction(async (tx) => {
        const existing = await tx.get(txRef);
        if (existing.exists) return;
        tx.set(txRef, {
          provider: 'click',
          providerPaymentId: clickTransId,
          clickTransId,
          intentId,
          companyId: intent.companyId,
          amountMinor,
          currency,
          periodStart: period.start,
          periodEnd: period.end,
          merchantTransId,
          state: 'prepared',
          createdAt: FieldValue.serverTimestamp(),
          rawEvent: body,
        });
        tx.set(firestore.doc(`subscriptionPaymentIntents/${intentId}`), {
          status: 'prepared',
          providerPaymentId: clickTransId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      res.status(200).json(clickResponse({
        clickTransId,
        merchantTransId,
        merchantPrepareId: prepareId,
        error: 0,
        errorNote: 'Success',
      }));
      return;
    }

    if (action === '1') {
      const errorCode = Number(body.error || 0);
      const prepareId = parseString(body.merchant_prepare_id, 'merchant_prepare_id');
      const txRef = firestore.doc(`paymentProviderTransactions/${prepareId}`);
      const txSnap = await txRef.get();
      if (!txSnap.exists) {
        res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -6, errorNote: 'Transaction not found.' }));
        return;
      }
      const txData = txSnap.data() || {};
      if (txData.state === 'confirmed') {
        res.status(200).json(clickResponse({ clickTransId, merchantTransId, merchantConfirmId: prepareId, error: 0, errorNote: 'Success' }));
        return;
      }
      if (errorCode !== 0) {
        await txRef.set({ state: 'failed', clickError: errorCode, errorNote: body.error_note || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        res.status(200).json(clickResponse({ clickTransId, merchantTransId, merchantConfirmId: prepareId, error: errorCode, errorNote: body.error_note || 'Payment failed.' }));
        return;
      }
      await applySubscriptionPaymentResult({
        companyId: parseString(txData.companyId, 'companyId'),
        provider: 'click',
        providerPaymentId: clickTransId,
        amountMinor: parseMinorUnits(txData.amountMinor, 'amountMinor'),
        currency: parseCurrency(txData.currency || 'UZS'),
        status: 'confirmed',
        paidAt: Timestamp.now(),
        periodStart: txData.periodStart,
        periodEnd: txData.periodEnd,
        rawEvent: body,
      });
      await txRef.set({ state: 'confirmed', confirmedAt: FieldValue.serverTimestamp(), rawCompleteEvent: body }, { merge: true });
      await firestore.doc(`subscriptionPaymentIntents/${intentId}`).set({ status: 'paid', paidAt: FieldValue.serverTimestamp() }, { merge: true });
      res.status(200).json(clickResponse({ clickTransId, merchantTransId, merchantConfirmId: prepareId, error: 0, errorNote: 'Success' }));
      return;
    }

    res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -3, errorNote: 'Action not found.' }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Click processing failed.';
    functions.logger.error('[clickMerchantWebhook]', message);
    res.status(200).json(clickResponse({ clickTransId, merchantTransId, error: -8, errorNote: message }));
  }
});

export const stripeSubscriptionWebhook = functions.region(REGION).https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed.');
    return;
  }

  try {
    const webhookSecret = getEnvSecret('STRIPE_WEBHOOK_SECRET', 'stripe.webhook_secret');
    const signature = req.header('stripe-signature');
    if (!signature) {
      res.status(400).send('Missing Stripe signature.');
      return;
    }
    const rawBody = req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
    verifyStripeSignature(rawBody, signature, webhookSecret);
    const event = JSON.parse(rawBody.toString('utf8'));
    const eventId = parseString(event.id, 'event.id');
    const eventType = parseString(event.type, 'event.type');

    if (![
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
    ].includes(eventType)) {
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const payload = extractSubscriptionPayload(event);
    if (!payload.companyId) {
      await firestore.collection('systemAuditLogs').doc(`stripe_${eventId}`).set({
        action: 'STRIPE_EVENT_MISSING_COMPANY',
        eventId,
        eventType,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const periodStart = payload.currentPeriodStart || Timestamp.now();
    const periodEnd = payload.currentPeriodEnd || Timestamp.fromMillis(periodStart.toMillis() + 30 * 24 * 60 * 60 * 1000);
    await applySubscriptionPaymentResult({
      companyId: payload.companyId,
      provider: 'stripe',
      providerPaymentId: payload.subscriptionId || eventId,
      amountMinor: Math.max(0, Number(payload.amountMinor || 0)),
      currency: parseCurrency(payload.currency || 'USD'),
      status: payload.subscriptionStatus,
      paidAt: Timestamp.now(),
      periodStart,
      periodEnd,
      rawEvent: {
        eventId,
        eventType,
        customerId: payload.customerId,
        cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
      },
    });
    await firestore.doc(`companies/${payload.companyId}`).set({
      stripeCustomerId: payload.customerId,
      cancelAtPeriodEnd: payload.cancelAtPeriodEnd,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof functions.https.HttpsError ? error.message : 'Stripe webhook processing failed.';
    functions.logger.error('[stripeSubscriptionWebhook]', message);
    res.status(400).send(message);
  }
});

export const superAdminSetCompanyStatus = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const companyId = parseString(data?.companyId, 'companyId');
  const reason = parseString(data?.reason, 'reason');
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), statusUpdatedBy: auth.uid };

  if (data?.administrativeLock !== undefined) patch.administrativeLock = parseBoolean(data.administrativeLock, 'administrativeLock');
  if (data?.isPaid !== undefined) patch.isPaid = parseBoolean(data.isPaid, 'isPaid');
  if (data?.forcedSubscriptionStatus !== undefined) {
    const status = parseString(data.forcedSubscriptionStatus, 'forcedSubscriptionStatus');
    if (!SUBSCRIPTION_STATUSES.has(status)) throw new functions.https.HttpsError('invalid-argument', 'Invalid subscription status.');
    patch.forcedSubscriptionStatus = status;
    patch.subscriptionStatus = status;
  }
  if (data?.trialEndsAt !== undefined) {
    const trialEndsAt = parseOptionalDate(data.trialEndsAt, 'trialEndsAt');
    patch.trialEndsAt = trialEndsAt ? Timestamp.fromDate(trialEndsAt) : null;
  }

  const companyRef = firestore.doc(`companies/${companyId}`);
  const beforeSnap = await companyRef.get();
  if (!beforeSnap.exists) throw new functions.https.HttpsError('not-found', 'Company not found.');
  await companyRef.set(patch, { merge: true });
  const afterSnap = await companyRef.get();
  await writeSystemAudit(auth.uid, 'SUPER_ADMIN_SET_COMPANY_STATUS', companyId, beforeSnap.data(), afterSnap.data(), reason);
  await writeTenantAudit(companyId, auth.uid, 'SUPER_ADMIN_SET_COMPANY_STATUS', companyId, beforeSnap.data(), afterSnap.data(), reason);
  return { success: true, companyId, status: afterSnap.data() };
});

export const superAdminListCompanies = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const limit = Math.min(Math.max(Number(data?.limit ?? 50), 1), 100);
  const pageToken = typeof data?.pageToken === 'string' ? data.pageToken : null;
  let query: FirebaseFirestore.Query = firestore.collection('companies').orderBy('createdAt', 'desc').limit(limit);
  if (pageToken) {
    const tokenSnap = await firestore.doc(`companies/${pageToken}`).get();
    if (tokenSnap.exists) query = query.startAfter(tokenSnap);
  }
  const snap = await query.get();
  const companies = snap.docs.map((doc) => {
    const company = doc.data();
    return {
      companyId: doc.id,
      name: company.name ?? '',
      ownerId: company.ownerId ?? null,
      subscriptionStatus: company.subscriptionStatus ?? 'inactive',
      subscriptionProvider: company.subscriptionProvider ?? null,
      subscriptionId: company.subscriptionId ?? null,
      subscriptionPeriodStart: company.subscriptionPeriodStart ?? null,
      subscriptionPeriodEnd: company.subscriptionPeriodEnd ?? null,
      lastPaymentAt: company.lastPaymentAt ?? null,
      isPaid: company.isPaid === true,
      administrativeLock: company.administrativeLock === true,
      userCount: Number(company.userCount ?? 0),
      createdAt: company.createdAt ?? null,
      updatedAt: company.updatedAt ?? null,
    };
  });
  return {
    companies,
    nextPageToken: snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null,
  };
});

export const superAdminGetPlatformAnalytics = functions.region(REGION).https.onCall(async (_data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const [companiesSnap, usersSnap, systemAdminsSnap, auditSnap, paymentEventsSnap, paymentIntentsSnap] = await Promise.all([
    firestore.collection('companies').orderBy('createdAt', 'desc').limit(5000).get(),
    firestore.collection('users').limit(5000).get(),
    firestore.collection('systemAdmins').limit(500).get(),
    firestore.collection('systemAuditLogs').orderBy('createdAt', 'desc').limit(25).get(),
    firestore.collection('paymentProviderEvents').orderBy('processedAt', 'desc').limit(50).get(),
    firestore.collection('subscriptionPaymentIntents').orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  const byStatus: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  const revenueByCurrency: Record<string, number> = {};
  let activeCompanies = 0;
  let blockedCompanies = 0;
  let trialCompanies = 0;
  let paidCompanies = 0;
  let unpaidCompanies = 0;

  for (const doc of companiesSnap.docs) {
    const company = doc.data() || {};
    const status = String(company.subscriptionStatus || (company.isPaid ? 'active' : 'inactive'));
    const provider = String(company.subscriptionProvider || 'manual');
    byStatus[status] = (byStatus[status] || 0) + 1;
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    if (company.administrativeLock === true || status === 'blocked') blockedCompanies += 1;
    if (status === 'active' && company.administrativeLock !== true) activeCompanies += 1;
    if (status === 'trialing') trialCompanies += 1;
    if (company.isPaid === true) paidCompanies += 1;
    else unpaidCompanies += 1;
  }

  const latestPaymentEvents = paymentEventsSnap.docs.map((doc) => {
    const event = doc.data() || {};
    const status = String(event.status || '');
    const currency = String(event.currency || 'UZS');
    const amountMinor = Number(event.amountMinor || 0);
    if (['confirmed', 'paid', 'succeeded', 'success'].includes(status) && Number.isSafeInteger(amountMinor)) {
      revenueByCurrency[currency] = (revenueByCurrency[currency] || 0) + amountMinor;
    }
    return {
      id: doc.id,
      companyId: event.companyId || null,
      provider: event.provider || null,
      providerPaymentId: event.providerPaymentId || null,
      amountMinor,
      currency,
      status,
      subscriptionStatus: event.subscriptionStatus || null,
      processedAt: timestampToIso(event.processedAt),
    };
  });

  const latestPaymentIntents = paymentIntentsSnap.docs.map((doc) => {
    const intent = doc.data() || {};
    return {
      id: doc.id,
      companyId: intent.companyId || null,
      provider: intent.provider || null,
      amountMinor: Number(intent.amountMinor || 0),
      currency: intent.currency || null,
      status: intent.status || null,
      createdAt: timestampToIso(intent.createdAt),
      expiresAt: timestampToIso(intent.expiresAt),
    };
  });

  const latestSystemAuditLogs = auditSnap.docs.map((doc) => {
    const log = doc.data() || {};
    return {
      id: doc.id,
      actorUid: log.actorUid || log.actor || null,
      action: log.action || null,
      targetId: log.targetId || null,
      reason: log.reason || null,
      createdAt: timestampToIso(log.createdAt),
    };
  });

  const latestCompanyRegistrations = companiesSnap.docs.slice(0, 10).map((doc) => {
    const company = doc.data() || {};
    return {
      companyId: doc.id,
      name: company.name || doc.id,
      ownerId: company.ownerId || null,
      subscriptionStatus: company.subscriptionStatus || 'inactive',
      subscriptionProvider: company.subscriptionProvider || 'manual',
      administrativeLock: company.administrativeLock === true,
      createdAt: timestampToIso(company.createdAt),
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      totalCompanies: companiesSnap.size,
      activeCompanies,
      blockedCompanies,
      trialCompanies,
      paidCompanies,
      unpaidCompanies,
      totalUsers: usersSnap.size,
      totalSystemAdmins: systemAdminsSnap.size,
      totalPaymentEvents: paymentEventsSnap.size,
      pendingPaymentIntents: latestPaymentIntents.filter((intent) => ['pending', 'created', 'prepared'].includes(String(intent.status))).length,
    },
    byStatus,
    byProvider,
    revenueByCurrency,
    latestCompanyRegistrations,
    latestPaymentEvents,
    latestPaymentIntents,
    latestSystemAuditLogs,
  };
});

export const superAdminInviteCompany = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const email = parseString(data?.email, 'email').toLowerCase();
  const companyName = parseString(data?.companyName, 'companyName');
  const ownerName = sanitizeForDocument(data?.ownerName || email, 120);
  const token = createInviteToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inviteRef = firestore.collection('companyInvites').doc();
  await inviteRef.set({
    email,
    companyName,
    ownerName,
    role: 'admin',
    status: 'pending',
    tokenHash: hashInviteToken(token),
    inviteType: 'company_owner',
    createdBy: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });
  await writeSystemAudit(auth.uid, 'SUPER_ADMIN_INVITE_COMPANY', inviteRef.id, null, { email, companyName }, 'company owner invite');
  return { inviteId: inviteRef.id, email, companyName, expiresAt: expiresAt.toDate().toISOString(), acceptToken: token };
});

export const createCompanyMemberInvite = functions.region(REGION).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, ADMIN_ROLES);
  const email = parseString(data?.email, 'email').toLowerCase();
  const role = parseString(data?.role, 'role');
  assertInvitableRole(role);
  const token = createInviteToken();
  const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const inviteRef = firestore.collection('companyInvites').doc();
  await inviteRef.set({
    email,
    companyId,
    role,
    status: 'pending',
    tokenHash: hashInviteToken(token),
    inviteType: 'company_member',
    createdBy: access.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  });
  await writeTenantAudit(companyId, access.uid, 'CREATE_COMPANY_MEMBER_INVITE', inviteRef.id, null, { email, role }, 'member invite');
  return { inviteId: inviteRef.id, email, role, expiresAt: expiresAt.toDate().toISOString(), acceptToken: token };
});

export const createUserAndCompany = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  const displayName = sanitizeForDocument(data?.displayName || auth.token.name || auth.token.email || 'Owner', 120);
  const companyName = parseString(data?.companyName, 'companyName');
  const email = String(auth.token.email || '').toLowerCase();
  if (!email) throw new functions.https.HttpsError('failed-precondition', 'Authenticated user email is required.');

  const existingProfile = await firestore.doc(`users/${auth.uid}`).get();
  if (existingProfile.exists && existingProfile.data()?.companyId) {
    throw new functions.https.HttpsError('failed-precondition', 'User already belongs to a company.');
  }

  const companyRef = firestore.collection('companies').doc();
  const trialEndsAt = Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await firestore.runTransaction(async (tx) => {
    tx.set(companyRef, {
      name: companyName,
      ownerId: auth.uid,
      userCount: 1,
      baseCurrency: 'USD',
      subscriptionStatus: 'trialing',
      subscriptionProvider: getConfiguredPaymentProvider(),
      isPaid: false,
      trialEndsAt,
      administrativeLock: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(firestore.doc(`companies/${companyRef.id}/members/${auth.uid}`), {
      uid: auth.uid,
      email,
      companyId: companyRef.id,
      role: 'admin',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: auth.uid,
    });
    tx.set(firestore.doc(`users/${auth.uid}`), {
      uid: auth.uid,
      email,
      name: displayName,
      companyId: companyRef.id,
      role: 'admin',
      status: 'active',
      isPaid: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await admin.auth().setCustomUserClaims(auth.uid, { companyId: companyRef.id, role: 'admin' });
  await writeTenantAudit(companyRef.id, auth.uid, 'CREATE_USER_AND_COMPANY', companyRef.id, null, { companyName, ownerId: auth.uid }, 'owner signup');
  return { success: true, companyId: companyRef.id };
});

export const inviteUserToCompany = functions.region(REGION).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  const access = await resolveCompanyAccess(context, companyId, ADMIN_ROLES);
  const email = parseString(data?.email, 'email').toLowerCase();
  const password = parseString(data?.password, 'password');
  const name = sanitizeForDocument(data?.name || email, 120);
  const role = parseString(data?.role, 'role');
  assertInvitableRole(role);
  if (password.length < 8) throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 8 characters.');

  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password, displayName: name, emailVerified: false, disabled: false });
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('failed-precondition', 'A user with this email already exists.');
    }
    throw error;
  }

  await firestore.runTransaction(async (tx) => {
    tx.set(firestore.doc(`companies/${companyId}/members/${userRecord.uid}`), {
      uid: userRecord.uid,
      email,
      companyId,
      role,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: access.uid,
    });
    tx.set(firestore.doc(`users/${userRecord.uid}`), {
      uid: userRecord.uid,
      email,
      name,
      companyId,
      role,
      status: 'active',
      isPaid: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: access.uid,
    });
    tx.set(firestore.doc(`companies/${companyId}`), {
      userCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await admin.auth().setCustomUserClaims(userRecord.uid, { companyId, role });
  await writeTenantAudit(companyId, access.uid, 'INVITE_USER_TO_COMPANY', userRecord.uid, null, { email, role }, 'direct member provisioning');
  return { success: true, uid: userRecord.uid, email, role };
});

export const repairMyClaims = functions.region(REGION).https.onCall(async (_data, context) => {
  const auth = requireAuthenticated(context);
  const systemAdmin = await firestore.doc(`systemAdmins/${auth.uid}`).get();
  if (systemAdmin.exists) {
    await admin.auth().setCustomUserClaims(auth.uid, { role: 'developer', systemAdmin: true });
    return { success: true, role: 'developer', systemAdmin: true };
  }
  const userSnap = await firestore.doc(`users/${auth.uid}`).get();
  if (!userSnap.exists) throw new functions.https.HttpsError('not-found', 'User profile not found.');
  const user = userSnap.data() || {};
  const companyId = parseString(user.companyId, 'companyId');
  const memberSnap = await firestore.doc(`companies/${companyId}/members/${auth.uid}`).get();
  if (!memberSnap.exists || memberSnap.data()?.status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Active company membership is required.');
  }
  const role = parseString(memberSnap.data()?.role, 'role');
  assertInvitableRole(role);
  await admin.auth().setCustomUserClaims(auth.uid, { companyId, role });
  return { success: true, companyId, role };
});

export const backfillCompanyMembersFromUsers = functions.region(REGION).runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  if (typeof data?.dryRun !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'dryRun boolean is required.');
  }
  const dryRun = parseBoolean(data.dryRun, 'dryRun');
  const limit = Math.min(Math.max(Number(data?.limit ?? 200), 1), 200);
  const pageToken = typeof data?.pageToken === 'string' ? data.pageToken : null;
  let query: FirebaseFirestore.Query = firestore.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(limit);
  if (pageToken) {
    const tokenSnap = await firestore.doc(`users/${pageToken}`).get();
    if (tokenSnap.exists) query = query.startAfter(tokenSnap);
  }

  const snap = await query.get();
  const batch = firestore.batch();
  const companyAuditCounts = new Map<string, number>();
  const errors: Array<{ uid: string; reason: string }> = [];
  let processed = 0;
  let toCreate = 0;
  let existing = 0;
  let skipped = 0;

  for (const userDoc of snap.docs) {
    processed += 1;
    const user = userDoc.data() || {};
    const uid = user.uid || userDoc.id;
    const companyId = typeof user.companyId === 'string' ? user.companyId.trim() : '';
    if (!companyId) {
      skipped += 1;
      continue;
    }
    const role = typeof user.role === 'string' && ['developer', 'admin', 'manager', 'sales', 'accounting'].includes(user.role)
      ? user.role as UserRole
      : 'sales';
    const status = user.status === 'blocked' ? 'blocked' : user.status === 'inactive' ? 'inactive' : 'active';
    try {
      const [companySnap, memberSnap] = await Promise.all([
        firestore.doc(`companies/${companyId}`).get(),
        firestore.doc(`companies/${companyId}/members/${uid}`).get(),
      ]);
      if (!companySnap.exists) {
        errors.push({ uid, reason: `Company not found: ${companyId}` });
        skipped += 1;
        continue;
      }
      if (memberSnap.exists) {
        existing += 1;
        continue;
      }
      toCreate += 1;
      companyAuditCounts.set(companyId, (companyAuditCounts.get(companyId) || 0) + 1);
      if (!dryRun) {
        batch.set(firestore.doc(`companies/${companyId}/members/${uid}`), {
          uid,
          email: user.email ?? null,
          companyId,
          role,
          status,
          createdAt: user.createdAt ?? FieldValue.serverTimestamp(),
          createdBy: user.createdBy ?? 'backfillCompanyMembersFromUsers',
          backfilledAt: FieldValue.serverTimestamp(),
          backfilledBy: auth.uid,
        }, { merge: true });
        batch.set(userDoc.ref, {
          role,
          status,
          updatedAt: FieldValue.serverTimestamp(),
          membershipBackfilledAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch (error) {
      skipped += 1;
      errors.push({ uid, reason: error instanceof Error ? error.message : 'Unknown backfill error' });
    }
  }

  if (!dryRun && toCreate > 0) await batch.commit();
  for (const [companyId, count] of companyAuditCounts.entries()) {
    if (!dryRun) {
      await writeTenantAudit(companyId, auth.uid, 'BACKFILL_COMPANY_MEMBERS_FROM_USERS', companyId, null, {
        createdMembers: count,
        pageToken: pageToken ?? null,
      }, 'one-time company member backfill');
    }
  }
  const result = {
    dryRun,
    processed,
    toCreate,
    existing,
    skipped,
    errors: errors.slice(0, 100),
    nextPageToken: snap.docs.length === limit ? snap.docs[snap.docs.length - 1].id : null,
  };
  await writeSystemAudit(auth.uid, 'BACKFILL_COMPANY_MEMBERS_FROM_USERS', 'users', null, result, dryRun ? 'dry run' : 'live backfill');
  return { success: true, ...result };
});

export const acceptCompanyInvite = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  const token = parseString(data?.token, 'token');
  const tokenHash = hashInviteToken(token);
  const snap = await firestore.collection('companyInvites').where('tokenHash', '==', tokenHash).limit(1).get();
  if (snap.empty) throw new functions.https.HttpsError('not-found', 'Invite not found.');
  const inviteDoc = snap.docs[0];
  const invite = inviteDoc.data();
  if (invite.status !== 'pending') throw new functions.https.HttpsError('failed-precondition', 'Invite is not pending.');
  const expiresAt = invite.expiresAt instanceof Timestamp ? invite.expiresAt.toMillis() : 0;
  if (expiresAt <= Date.now()) {
    await inviteDoc.ref.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    throw new functions.https.HttpsError('failed-precondition', 'Invite has expired.');
  }
  const authEmail = String(auth.token.email || '').toLowerCase();
  if (authEmail && invite.email && authEmail !== String(invite.email).toLowerCase()) {
    throw new functions.https.HttpsError('permission-denied', 'Invite email does not match authenticated user.');
  }

  let companyId = invite.companyId as string | undefined;
  const role = String(invite.role || 'sales');
  assertInvitableRole(role);

  await firestore.runTransaction(async (tx) => {
    const freshInvite = await tx.get(inviteDoc.ref);
    if (!freshInvite.exists || freshInvite.data()?.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'Invite is no longer pending.');
    }
    if (!companyId) {
      const companyRef = firestore.collection('companies').doc();
      companyId = companyRef.id;
      tx.set(companyRef, {
        name: sanitizeForDocument(invite.companyName || 'New Company', 160),
        ownerId: auth.uid,
        userCount: 1,
        subscriptionStatus: 'trialing',
        subscriptionProvider: getConfiguredPaymentProvider(),
        isPaid: false,
        trialEndsAt: Timestamp.fromMillis(Date.now() + 14 * 24 * 60 * 60 * 1000),
        administrativeLock: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.set(firestore.doc(`companies/${companyId}/members/${auth.uid}`), {
      uid: auth.uid,
      email: invite.email,
      companyId,
      role,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: invite.createdBy ?? null,
    }, { merge: true });
    tx.set(firestore.doc(`users/${auth.uid}`), {
      uid: auth.uid,
      email: invite.email,
      name: sanitizeForDocument(invite.ownerName || auth.token.name || invite.email, 120),
      companyId,
      role,
      status: 'active',
      isPaid: role === 'admin',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(inviteDoc.ref, {
      status: 'accepted',
      acceptedBy: auth.uid,
      acceptedAt: FieldValue.serverTimestamp(),
      companyId,
    }, { merge: true });
  });

  await admin.auth().setCustomUserClaims(auth.uid, { companyId, role });
  return { success: true, companyId, role };
});

async function runSubscriptionExpiryCheck(actorUid = 'system', reason = 'subscription expiry check') {
  const snap = await firestore.collection('companies').limit(5000).get();
  let processed = 0;
  let updated = 0;
  const now = Date.now();
  for (const doc of snap.docs) {
    processed += 1;
    const company = doc.data();
    const patch: Record<string, unknown> = {};
    const trialEndsAt = company.trialEndsAt instanceof Timestamp ? company.trialEndsAt.toMillis() : null;
    const periodEnd = company.subscriptionPeriodEnd instanceof Timestamp ? company.subscriptionPeriodEnd.toMillis() : null;
    const status = String(company.subscriptionStatus || 'inactive');

    if (status === 'trialing' && trialEndsAt && trialEndsAt < now) {
      patch.subscriptionStatus = 'expired';
      patch.isPaid = false;
      patch.subscriptionAccessLocked = true;
    }
    if (['past_due', 'unpaid', 'canceled', 'incomplete_expired'].includes(status)) {
      patch.subscriptionAccessLocked = true;
      patch.isPaid = false;
    }
    if (status === 'active' && periodEnd && periodEnd < now) {
      patch.subscriptionStatus = 'expired';
      patch.isPaid = false;
      patch.subscriptionAccessLocked = true;
    }
    if (status === 'active' && periodEnd && periodEnd < now && company.cancelAtPeriodEnd === true) {
      patch.subscriptionStatus = 'expired';
      patch.isPaid = false;
      patch.subscriptionAccessLocked = true;
    }

    if (Object.keys(patch).length > 0) {
      updated += 1;
      await doc.ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await writeTenantAudit(doc.id, actorUid, 'SYNC_EXPIRED_SUBSCRIPTIONS', doc.id, company, patch, reason);
    }
  }
  return { processed, updated };
}

export const runSubscriptionExpiryCheckNow = functions.region(REGION).https.onCall(async (data, context) => {
  const auth = requireAuthenticated(context);
  await requireSystemAdmin(auth.uid);
  const reason = sanitizeForDocument(data?.reason || 'manual subscription expiry check', 300);
  const result = await runSubscriptionExpiryCheck(auth.uid, reason);
  await writeSystemAudit(auth.uid, 'RUN_SUBSCRIPTION_EXPIRY_CHECK_NOW', 'companies', null, result, reason);
  return { success: true, ...result };
});

if (process.env.ENABLE_SCHEDULED_SUBSCRIPTION_CHECK === 'true') {
  exports.syncExpiredSubscriptions = functions.region(REGION).pubsub.schedule('every 24 hours').onRun(async () => {
    const result = await runSubscriptionExpiryCheck('system', 'scheduled subscription sync');
    await writeSystemAudit('system', 'SYNC_EXPIRED_SUBSCRIPTIONS', 'companies', null, result, 'scheduled subscription sync');
    return result;
  });
}

export const ensureLedgerBusinessDate = functions.region(REGION).firestore.document('companies/{companyId}/clients/{clientId}/ledger/{entryId}').onCreate(stampBusinessDate);
export const ensureExpenseBusinessDate = functions.region(REGION).firestore.document('companies/{companyId}/dailyExpenses/{expenseId}').onCreate(stampBusinessDate);
export const ensureSaleBusinessDate = functions.region(REGION).firestore.document('companies/{companyId}/sales/{saleId}').onCreate(stampBusinessDate);
export const ensureIncomingBusinessDate = functions.region(REGION).firestore.document('companies/{companyId}/incomingProducts/{logId}').onCreate(stampBusinessDate);
export const ensureSupplierLedgerBusinessDate = functions.region(REGION).firestore.document('companies/{companyId}/suppliers/{supplierId}/ledger/{entryId}').onCreate(stampBusinessDate);

export const auditIncomingDateTypes = functions.region(REGION).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const snapshot = await firestore.collection(`companies/${companyId}/incomingProducts`).get();
  const counts = { stringDates: 0, timestampDates: 0, missingDates: 0, total: snapshot.size };
  snapshot.forEach((doc) => {
    const dateValue = doc.data().date || doc.data().incomeDate;
    if (dateValue instanceof Timestamp) counts.timestampDates += 1;
    else if (typeof dateValue === 'string') counts.stringDates += 1;
    else counts.missingDates += 1;
  });
  return counts;
});

export const normalizeIncomingDates = functions.region(REGION).runWith({ timeoutSeconds: 300 }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const dryRun = data?.dryRun === undefined ? true : parseBoolean(data.dryRun, 'dryRun');
  const limit = Math.min(Math.max(Number(data?.limit ?? 500), 1), 1000);
  const snapshot = await firestore.collection(`companies/${companyId}/incomingProducts`).limit(limit).get();
  const logs: string[] = [];
  let updatedCount = 0;
  const batch = firestore.batch();

  for (const doc of snapshot.docs) {
    const docData = doc.data();
    const updates: Record<string, unknown> = {};
    for (const field of ['date', 'incomeDate', 'createdAt', 'updatedAt', 'businessDate']) {
      const dateVal = docData[field];
      if (typeof dateVal === 'string' && dateVal) {
        const parsedDate = new Date(dateVal);
        if (Number.isFinite(parsedDate.getTime())) updates[field] = Timestamp.fromDate(parsedDate);
      }
    }
    if (!docData.businessDay || !docData.businessDate) {
      const businessDay = toBusinessDayFromCreatedAt(docData.incomeDate || docData.date || docData.createdAt);
      updates.businessDay = businessDay;
      updates.businessDate = businessDayToBusinessDate(businessDay);
    }
    if (Object.keys(updates).length > 0) {
      updatedCount += 1;
      logs.push(`incomingProducts/${doc.id}`);
      if (!dryRun) batch.update(doc.ref, updates);
    }
  }
  if (!dryRun && updatedCount > 0) await batch.commit();
  return { scanned: snapshot.size, updated: updatedCount, logs: logs.slice(0, 100), dryRun };
});

export const backfillBusinessDates = functions.region(REGION).runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = typeof data?.companyId === 'string' ? data.companyId : undefined;
  const access = await resolveCompanyAccess(context, companyId, FINANCE_ROLES, { allowMissingCompany: !companyId });
  const dryRun = data?.dryRun === undefined ? true : parseBoolean(data.dryRun, 'dryRun');
  const companyDocs = companyId
    ? [await firestore.doc(`companies/${companyId}`).get()]
    : access.isSystemAdmin
      ? (await firestore.collection('companies').limit(5000).get()).docs
      : [await firestore.doc(`companies/${access.companyId}`).get()];
  let totalUpdated = 0;

  for (const companyDoc of companyDocs) {
    if (!companyDoc.exists) continue;
    for (const path of ['dailyExpenses', 'sales', 'incomingProducts']) {
      const snap = await firestore.collection(`companies/${companyDoc.id}/${path}`).limit(5000).get();
      for (const doc of snap.docs) {
        const data = doc.data();
        if (data.businessDay && data.businessDate) continue;
        const businessDay = toBusinessDayFromCreatedAt(data.date || data.incomeDate || data.createdAt);
        totalUpdated += 1;
        if (!dryRun) await doc.ref.set({ businessDay, businessDate: businessDayToBusinessDate(businessDay) }, { merge: true });
      }
    }
  }
  return { success: true, dryRun, companiesProcessed: companyDocs.length, totalUpdated };
});

export const createBackup = functions.region(REGION).runWith({ timeoutSeconds: 540, memory: '1GB' }).https.onCall(async (data, context) => {
  const companyId = parseString(data?.companyId, 'companyId');
  await resolveCompanyAccess(context, companyId, FINANCE_ROLES);
  const collections = Array.isArray(data?.collections) ? data.collections.map((item: unknown) => parseString(item, 'collection')) : [];
  if (collections.length === 0) throw new functions.https.HttpsError('invalid-argument', 'collections must be a non-empty array.');
  const backupTimestamp = new Date().toISOString().replace(/:/g, '-');
  const backupPrefix = `backups/${companyId}/${backupTimestamp}`;
  const summary: Record<string, number> = {};

  for (const coll of collections) {
    if (!/^[a-zA-Z0-9_-]+$/.test(coll)) throw new functions.https.HttpsError('invalid-argument', 'Invalid collection name.');
    const originalDocs = await firestore.collection(`companies/${companyId}/${coll}`).limit(5000).get();
    summary[coll] = originalDocs.size;
    for (let i = 0; i < originalDocs.docs.length; i += 450) {
      const batch = firestore.batch();
      for (const doc of originalDocs.docs.slice(i, i + 450)) {
        batch.set(firestore.collection(`${backupPrefix}/${coll}`).doc(doc.id), doc.data());
      }
      await batch.commit();
    }
  }

  return { success: true, backupPrefix, summary };
});
