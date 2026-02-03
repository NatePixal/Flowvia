import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { fromMinor, toMinor, convertMinorToBase, convertBaseToMinor } from './money';
import { Client, ClientLedgerEntry, Currency, Sale } from './types';

if (!admin.apps.length) {
  admin.initializeApp();
}
const firestore = admin.firestore();


// --- AUDIT AND REPAIR FUNCTIONS (for developers/admins) ---

export const auditFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for auditing financials
});

export const migrateProductsToMinorUnits = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for migrating products
});

export const recalculateSalesFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    // Implementation for recalculating sales
});

export const deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    // Implementation for deep repair
});

export const recalculateAllClientBalances = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540 })
  .https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
      throw new functions.https.HttpsError('permission-denied', 'Admin or Developer access required.');
    }

    const { companyId, dryRun = true } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');

    const clientsRef = firestore.collection(`companies/${companyId}/clients`);
    const clientsSnap = await clientsRef.get();

    const logs: string[] = [];
    let clientsForUpdate = 0;

    // ✅ MUST be let, because we reset it after commit
    let batch = firestore.batch();
    let writeCount = 0;

    const normalizeBalances = (b: Record<string, number>) => {
      const out: Record<string, number> = {};
      for (const k of Object.keys(b)) {
        const n = Number(b[k] ?? 0);
        if (n !== 0) out[k] = n; // keep signed values, drop zeros
      }
      return out;
    };

    const stableStringify = (obj: Record<string, any>) =>
      JSON.stringify(
        Object.keys(obj)
          .sort()
          .reduce((acc, k) => {
            acc[k] = obj[k];
            return acc;
          }, {} as Record<string, any>)
      );

    for (const clientDoc of clientsSnap.docs) {
      const clientData = clientDoc.data() as Client;

      const ledgerRef = firestore.collection(`companies/${companyId}/clients/${clientDoc.id}/ledger`);
      const ledgerSnap = await ledgerRef.get();

      const newBalancesRaw: Record<string, number> = {};

      ledgerSnap.forEach((d) => {
        const entry = d.data() as ClientLedgerEntry;
        const currency = entry.currency;
        if (!currency) return;

        if (newBalancesRaw[currency] === undefined) newBalancesRaw[currency] = 0;

        if (entry.type === 'purchase') {
          // purchases contribute positive
          const purchaseMinor = Number(entry.totalMinor ?? 0);
          newBalancesRaw[currency] += purchaseMinor;
        } else if (entry.type === 'payment') {
          // payments subtract; support legacy rows
          const payMinor = Number(entry.paymentMinor ?? entry.totalMinor ?? 0);
          newBalancesRaw[currency] -= payMinor;
        }
      });

      const newBalances = normalizeBalances(newBalancesRaw);

      const oldBalances = normalizeBalances((clientData.outstandingByCurrency as any) || {});
      const oldJSON = stableStringify(oldBalances);
      const newJSON = stableStringify(newBalances);

      if (oldJSON !== newJSON) {
        clientsForUpdate++;

        if (logs.length < 200) {
          logs.push(
            `Client ${clientDoc.id} (${clientData.name || '—'}): OLD=${oldJSON} NEW=${newJSON}`
          );
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
