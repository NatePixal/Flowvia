"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateAllClientBalances = exports.deepRepairFinancials = exports.recalculateSalesFinancials = exports.migrateProductsToMinorUnits = exports.auditFinancials = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
// --- AUDIT AND REPAIR FUNCTIONS (for developers/admins) ---
exports.auditFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for auditing financials
});
exports.migrateProductsToMinorUnits = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for migrating products
});
exports.recalculateSalesFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for recalculating sales
});
exports.deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // Implementation for deep repair
});
exports.recalculateAllClientBalances = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 540 })
    .https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer access required.');
    }
    const { companyId, dryRun = true } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    const clientsRef = firestore.collection(`companies/${companyId}/clients`);
    const clientsSnap = await clientsRef.get();
    const logs = [];
    let clientsForUpdate = 0;
    // ✅ MUST be let, because we reset it after commit
    let batch = firestore.batch();
    let writeCount = 0;
    const normalizeBalances = (b) => {
        var _a;
        const out = {};
        for (const k of Object.keys(b)) {
            const n = Number((_a = b[k]) !== null && _a !== void 0 ? _a : 0);
            if (n !== 0)
                out[k] = n; // keep signed values, drop zeros
        }
        return out;
    };
    const stableStringify = (obj) => JSON.stringify(Object.keys(obj)
        .sort()
        .reduce((acc, k) => {
        acc[k] = obj[k];
        return acc;
    }, {}));
    for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data();
        const ledgerRef = firestore.collection(`companies/${companyId}/clients/${clientDoc.id}/ledger`);
        const ledgerSnap = await ledgerRef.get();
        const newBalancesRaw = {};
        ledgerSnap.forEach((d) => {
            var _a, _b, _c;
            const entry = d.data();
            const currency = entry.currency;
            if (!currency)
                return;
            if (newBalancesRaw[currency] === undefined)
                newBalancesRaw[currency] = 0;
            if (entry.type === 'purchase') {
                // purchases contribute positive
                const purchaseMinor = Number((_a = entry.totalMinor) !== null && _a !== void 0 ? _a : 0);
                newBalancesRaw[currency] += purchaseMinor;
            }
            else if (entry.type === 'payment') {
                // payments subtract; support legacy rows
                const payMinor = Number((_c = (_b = entry.paymentMinor) !== null && _b !== void 0 ? _b : entry.totalMinor) !== null && _c !== void 0 ? _c : 0);
                newBalancesRaw[currency] -= payMinor;
            }
        });
        const newBalances = normalizeBalances(newBalancesRaw);
        const oldBalances = normalizeBalances(clientData.outstandingByCurrency || {});
        const oldJSON = stableStringify(oldBalances);
        const newJSON = stableStringify(newBalances);
        if (oldJSON !== newJSON) {
            clientsForUpdate++;
            if (logs.length < 200) {
                logs.push(`Client ${clientDoc.id} (${clientData.name || '—'}): OLD=${oldJSON} NEW=${newJSON}`);
            }
            if (!dryRun) {
                batch.update(clientDoc.ref, { outstandingByCurrency: newBalances });
                writeCount++;
                if (writeCount >= 400) {
                    await batch.commit();
                    batch = firestore.batch();
                    writeCount = 0;
                }
            }
        }
    }
    if (!dryRun && writeCount > 0) {
        await batch.commit();
    }
    return {
        success: true,
        dryRun,
        clientsProcessed: clientsSnap.size,
        clientsForUpdate,
        logs: dryRun ? logs : [`Updated ${clientsForUpdate} clients.`],
    };
});
//# sourceMappingURL=financials.js.map