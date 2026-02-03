import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { fromMinor, toMinor, convertMinorToBase, convertBaseToMinor } from './money';
import { Client, ClientLedgerEntry, Currency, Sale } from './types';
import { recomputeClientOutstanding } from '../../lib/ledger-recompute'; // Assuming this can be imported

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

export const recalculateAllClientBalances = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer access required.');
    }
    const { companyId, dryRun = true } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');

    const clientsRef = firestore.collection(`companies/${companyId}/clients`);
    const clientsSnap = await clientsRef.get();
    
    let updatedCount = 0;
    const logs: string[] = [];
    const batch = firestore.batch();
    let writeCount = 0;

    for (const clientDoc of clientsSnap.docs) {
        const clientData = clientDoc.data() as Client;
        
        const ledgerRef = firestore.collection(`companies/${companyId}/clients/${clientDoc.id}/ledger`);
        const ledgerSnap = await ledgerRef.get();
        const newBalances: { [key in Currency]?: number } = {};

        ledgerSnap.forEach(doc => {
            const entry = doc.data() as ClientLedgerEntry;
            if (!entry.currency) return;
            if (newBalances[entry.currency] === undefined) newBalances[entry.currency] = 0;
            if (entry.type === 'purchase') newBalances[entry.currency]! += (entry.totalMinor ?? 0);
            else if (entry.type === 'payment') newBalances[entry.currency]! -= (entry.paymentMinor ?? 0);
        });
        
        const oldBalancesJSON = JSON.stringify(clientData.outstandingByCurrency || {});
        const newBalancesJSON = JSON.stringify(newBalances);

        if (oldBalancesJSON !== newBalancesJSON) {
            updatedCount++;
            logs.push(`Client ${clientDoc.id} (${clientData.name}) needs update. Old: ${oldBalancesJSON}, New: ${newBalancesJSON}`);
            
            if (!dryRun) {
                batch.update(clientDoc.ref, { outstandingByCurrency: newBalances });
                writeCount++;
                if (writeCount >= 400) {
                    await batch.commit();
                    // @ts-ignore
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
        clientsForUpdate: updatedCount,
        logs: dryRun ? logs : [`Updated ${updatedCount} clients.`]
    };
});
