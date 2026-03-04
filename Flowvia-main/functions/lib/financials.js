"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateClientBalances = exports.updateMonthlyRevenue = exports.updateDashboardStats = exports.deepRepairFinancials = exports.recalculateSalesFinancials = exports.migrateProductsToMinorUnits = exports.auditFinancials = exports.recalculateAllClientBalances = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
// Reusable Security Assertions
function assertAdminOrDeveloper(context) {
    if (!context.auth || (context.auth.token.role !== 'admin' && context.auth.token.role !== 'developer')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer access required.');
    }
}
function assertCompanyAccess(context, companyId) {
    var _a, _b;
    if (((_a = context.auth) === null || _a === void 0 ? void 0 : _a.token.role) === 'developer')
        return;
    if (((_b = context.auth) === null || _b === void 0 ? void 0 : _b.token.companyId) !== companyId) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have access to this company.');
    }
}
// Batched Update Helper
async function batchedUpdate(updates) {
    const batchSize = 450;
    for (let i = 0; i < updates.length; i += batchSize) {
        const batch = firestore.batch();
        updates.slice(i, i + batchSize).forEach(u => batch.update(u.ref, u.data));
        await batch.commit();
    }
}
exports.recalculateAllClientBalances = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    const clientsSnap = await firestore.collection(`companies/${companyId}/clients`).get();
    const logs = [];
    let updatedCount = 0;
    for (const clientDoc of clientsSnap.docs) {
        const ledgerSnap = await clientDoc.ref.collection('ledger').get();
        const balances = {};
        ledgerSnap.forEach(d => {
            var _a, _b, _c;
            const entry = d.data();
            if (!entry.currency)
                return;
            const due = (_a = entry.dueMinor) !== null && _a !== void 0 ? _a : (((_b = entry.totalMinor) !== null && _b !== void 0 ? _b : 0) - ((_c = entry.paidMinor) !== null && _c !== void 0 ? _c : 0));
            balances[entry.currency] = (balances[entry.currency] || 0) + due;
        });
        await clientDoc.ref.update({ outstandingByCurrency: balances });
        updatedCount++;
    }
    return { success: true, clientsProcessed: clientsSnap.size, clientsUpdated: updatedCount, logs };
});
exports.auditFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, sampleLimit = 500 } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, message: `Audit for ${companyId} would run here. Limit: ${sampleLimit}` };
});
exports.migrateProductsToMinorUnits = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true, limit = 2000 } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, limit, message: 'Migration would run here.' };
});
exports.recalculateSalesFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true, limit = 2000, force = false } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, limit, force, message: 'Recalculation would run here.' };
});
exports.deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    assertAdminOrDeveloper(context);
    const { companyId, dryRun = true } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    assertCompanyAccess(context, companyId);
    return { ok: true, companyId, dryRun, message: 'Deep repair would run here.' };
});
// Compatibility Stubs
exports.updateDashboardStats = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'No-op: dashboard stats are computed client-side.' };
});
exports.updateMonthlyRevenue = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'No-op: monthly revenue is computed client-side.' };
});
exports.updateClientBalances = functions.region('us-central1').https.onCall(async () => {
    return { ok: true, message: 'Deprecated: use recalculateAllClientBalances.' };
});
//# sourceMappingURL=financials.js.map