import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Currency, UserRole } from './types';

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = () => admin.firestore();

export type CompanyMemberStatus = 'active' | 'inactive' | 'blocked' | 'pending';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'expired'
  | 'inactive'
  | 'blocked';

export type CompanyAccessOptions = {
  allowInactiveSubscription?: boolean;
  allowAdministrativeLock?: boolean;
  allowMissingCompany?: boolean;
};

export type CompanyAccess = {
  uid: string;
  companyId: string;
  isSystemAdmin: boolean;
  role: UserRole | 'system_admin';
  member: FirebaseFirestore.DocumentData | null;
  company: FirebaseFirestore.DocumentData;
};

const VALID_ROLES: UserRole[] = ['developer', 'admin', 'manager', 'sales', 'accounting'];
const VALID_CURRENCIES: Currency[] = ['USD', 'AED', 'SAR', 'JOD', 'EGP', 'UZS', 'CNY'];
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'expired',
  'inactive',
  'blocked',
]);

export function requireAuthenticated(context: functions.https.CallableContext): { uid: string; token: admin.auth.DecodedIdToken } {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  return context.auth as { uid: string; token: admin.auth.DecodedIdToken };
}

export async function requireSystemAdmin(uid: string): Promise<FirebaseFirestore.DocumentSnapshot> {
  const snap = await firestore().doc(`systemAdmins/${uid}`).get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'System administrator access required.');
  }
  return snap;
}

export async function isSystemAdmin(uid: string): Promise<boolean> {
  return (await firestore().doc(`systemAdmins/${uid}`).get()).exists;
}

export function assertAllowedRole(memberRole: string | undefined | null, allowedRoles: UserRole[]): asserts memberRole is UserRole {
  if (!memberRole || !VALID_ROLES.includes(memberRole as UserRole) || !allowedRoles.includes(memberRole as UserRole)) {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient role for this operation.');
  }
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof admin.firestore.Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

export function assertCompanyUsable(company: FirebaseFirestore.DocumentData): void {
  if (company.administrativeLock === true || company.blocked === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Company access is administratively locked.');
  }
}

export function assertActiveSubscription(company: FirebaseFirestore.DocumentData): void {
  if (company.subscriptionAccessLocked === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Company subscription access is locked.');
  }
  const forced = typeof company.forcedSubscriptionStatus === 'string' ? company.forcedSubscriptionStatus : null;
  const status = String(forced || company.subscriptionStatus || (company.isPaid === true ? 'active' : 'inactive'));
  const trialEndsAt = asDate(company.trialEndsAt);
  const periodEnd = asDate(company.subscriptionPeriodEnd);
  const now = Date.now();

  if (status === 'trialing') {
    if (trialEndsAt && trialEndsAt.getTime() < now) {
      throw new functions.https.HttpsError('failed-precondition', 'Company trial has expired.');
    }
    return;
  }

  if (status === 'active') {
    if (company.isPaid === false && periodEnd && periodEnd.getTime() < now) {
      throw new functions.https.HttpsError('failed-precondition', 'Company subscription period has expired.');
    }
    return;
  }

  if (BLOCKING_SUBSCRIPTION_STATUSES.has(status) || !ACTIVE_SUBSCRIPTION_STATUSES.has(status)) {
    throw new functions.https.HttpsError('failed-precondition', 'Company subscription is not active.');
  }
}

export async function resolveCompanyAccess(
  context: functions.https.CallableContext,
  inputCompanyId: string | undefined | null,
  allowedRoles: UserRole[],
  options: CompanyAccessOptions = {}
): Promise<CompanyAccess> {
  const auth = requireAuthenticated(context);
  const uid = auth.uid;
  const systemAdmin = await isSystemAdmin(uid);
  let companyId = inputCompanyId ? parseString(inputCompanyId, 'companyId') : '';

  if (systemAdmin) {
    if (!companyId && !options.allowMissingCompany) {
      throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    }
    if (!companyId) {
      return {
        uid,
        companyId: '',
        isSystemAdmin: true,
        role: 'system_admin',
        member: null,
        company: {},
      };
    }
    const companySnap = await firestore().doc(`companies/${companyId}`).get();
    if (!companySnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Company not found.');
    }
    return {
      uid,
      companyId,
      isSystemAdmin: true,
      role: 'system_admin',
      member: null,
      company: companySnap.data() || {},
    };
  }

  if (!companyId && typeof auth.token.companyId === 'string') {
    companyId = parseString(auth.token.companyId, 'companyId');
  }

  if (!companyId) {
    const userSnap = await firestore().doc(`users/${uid}`).get();
    const userCompanyId = userSnap.exists ? userSnap.data()?.companyId : null;
    if (typeof userCompanyId === 'string') {
      companyId = parseString(userCompanyId, 'companyId');
    }
  }

  if (!companyId) {
    throw new functions.https.HttpsError('failed-precondition', 'No company membership found for this user.');
  }

  const [companySnap, memberSnap] = await Promise.all([
    firestore().doc(`companies/${companyId}`).get(),
    firestore().doc(`companies/${companyId}/members/${uid}`).get(),
  ]);

  if (!companySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Company not found.');
  }
  if (!memberSnap.exists) {
    throw new functions.https.HttpsError('permission-denied', 'Company membership is required.');
  }

  const company = companySnap.data() || {};
  const member = memberSnap.data() || {};
  if (member.companyId && member.companyId !== companyId) {
    throw new functions.https.HttpsError('permission-denied', 'Membership company mismatch.');
  }
  if (member.status !== 'active') {
    throw new functions.https.HttpsError('permission-denied', 'Company membership is not active.');
  }

  assertAllowedRole(member.role, allowedRoles);
  if (!options.allowAdministrativeLock) assertCompanyUsable(company);
  if (!options.allowInactiveSubscription) assertActiveSubscription(company);

  return {
    uid,
    companyId,
    isSystemAdmin: false,
    role: member.role,
    member,
    company,
  };
}

export function parseString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is required.`);
  }
  if (trimmed.length > 512) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} is too long.`);
  }
  return trimmed;
}

export function parseNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a finite number.`);
  }
  return parsed;
}

export function parseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a boolean.`);
  }
  return value;
}

export function parseCurrency(value: unknown): Currency {
  const currency = parseString(value, 'currency').toUpperCase() as Currency;
  if (!VALID_CURRENCIES.includes(currency)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported currency.');
  }
  return currency;
}

export function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = asDate(value);
  if (!date) {
    throw new functions.https.HttpsError('invalid-argument', `${fieldName} must be a valid date.`);
  }
  return date;
}

export function parseDateRange(value: unknown): { from: Date | null; to: Date | null } {
  const source = (value && typeof value === 'object') ? value as Record<string, unknown> : {};
  const from = parseOptionalDate(source.dateFrom ?? source.from, 'dateFrom');
  const to = parseOptionalDate(source.dateTo ?? source.to, 'dateTo');
  if (from && to && from.getTime() > to.getTime()) {
    throw new functions.https.HttpsError('invalid-argument', 'dateFrom must be before dateTo.');
  }
  return { from, to };
}

export function sanitizeForDocument(value: unknown, maxLength = 240): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
