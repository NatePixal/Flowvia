import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { toMinor } from './money';

if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
type Currency = 'USD' | 'AED' | 'UZS' | 'CNY' | 'EUR' | 'KWD' | 'JOD' | 'BHD';

// Reusable Security Assertions
function assertAdminOrDeveloper(context: functions.https.CallableContext) {
  if (!context.auth || (context.auth.token.role !== 'admin' && context.auth.token.role !== 'developer')) {
    throw new functions.https.HttpsError('permission-denied', 'Admin or Developer access required.');
  }
}

function assertCompanyAccess(context: functions.https.CallableContext, companyId: string) {
  if (context.auth?.token.role === 'developer') return;
  if (context.auth?.token.companyId !== companyId) {
    throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company.');
  }
}

// Batched Update Helper
async function batchedUpdate(updates: { ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }[]) {
  const batchSize = 450;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = firestore.batch();
    updates.slice(i, i + batchSize).forEach(u => batch.update(u.ref, u.data));
    await batch.commit();
  }
}

export const recalculateAllClientBalances = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    
    const clientsSnap = await firestore.collection(`companies/${companyId}/clients`).get();
    const logs: string[] = [];
    let updatedCount = 0;

    for (const clientDoc of clientsSnap.docs) {
        const ledgerSnap = await clientDoc.ref.collection('ledger').get();
        const balances: Record<string, number> = {};
        ledgerSnap.forEach(d => {
            const entry = d.data() as any;
            if (!entry.currency) return;
            const due = entry.dueMinor ?? ((entry.totalMinor ?? 0) - (entry.paidMinor ?? 0));
            balances[entry.currency] = (balances[entry.currency] || 0) + due;
        });
        await clientDoc.ref.update({ outstandingByCurrency: balances });
        updatedCount++;
    }
    return { success: true, clientsProcessed: clientsSnap.size, clientsUpdated: updatedCount, logs };
});

export const auditFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, sampleLimit = 500 } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, message: `Audit for ${companyId} would run here. Limit: ${sampleLimit}` };
});

export const migrateProductsToMinorUnits = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true, limit = 2000 } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, limit, message: 'Migration would run here.' };
});

export const recalculateSalesFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true, limit = 2000, force = false } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, limit, force, message: 'Recalculation would run here.' };
});

export const deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, message: 'Deep repair would run here.' };
});

// Compatibility Stubs
export const updateDashboardStats = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'No-op: dashboard stats are computed client-side.' };
});
export const updateMonthlyRevenue = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'No-op: monthly revenue is computed client-side.' };
});
export const updateClientBalances = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'Deprecated: use recalculateAllClientBalances.' };
});
