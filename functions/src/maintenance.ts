// functions/src/maintenance.ts

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

function toBusinessDayFromCreatedAt(ts: admin.firestore.Timestamp, tz = 'Asia/Tashkent') {
  const d = ts.toDate();
  // Use en-CA format which produces YYYY-MM-DD
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(d);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const day = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${day}`;
}

function businessDayToBusinessDate(businessDay: string) {
  return Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
}

// Firestore Triggers for automatically adding businessDate on new documents
export const ensureLedgerBusinessDate = functions
  .region('us-central1')
  .firestore.document('companies/{companyId}/clients/{clientId}/ledger/{entryId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return null;

    const createdAt = data.createdAt;
    const businessDay = (createdAt) ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10);

    return snap.ref.update({
      businessDay,
      businessDate: businessDayToBusinessDate(businessDay),
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
    });
  });

export const ensureExpenseBusinessDate = functions
  .region('us-central1')
  .firestore.document('companies/{companyId}/dailyExpenses/{expenseId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return null;

    const createdAt = data.createdAt;
    const businessDay = (createdAt) ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10);

    return snap.ref.update({
      businessDay,
      businessDate: businessDayToBusinessDate(businessDay),
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
    });
  });

export const ensureSaleBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/sales/{saleId}')
    .onCreate(async (snap) => {
        const data = snap.data() || {};
        if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return null;
        
        const sourceTs = data.date || data.createdAt;
        const businessDay = sourceTs ? toBusinessDayFromCreatedAt(sourceTs) : new Date().toISOString().slice(0,10);
        
        return snap.ref.update({
            businessDay,
            businessDate: businessDayToBusinessDate(businessDay),
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        });
    });

export const ensureIncomingBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/incomingProducts/{logId}')
    .onCreate(async (snap) => {
        const data = snap.data() || {};
        if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return null;

        const sourceTs = data.incomeDate || data.date || data.createdAt;
        const businessDay = sourceTs ? toBusinessDayFromCreatedAt(sourceTs) : new Date().toISOString().slice(0,10);
        
        return snap.ref.update({
            businessDay,
            businessDate: businessDayToBusinessDate(businessDay),
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        });
    });

export const ensureSupplierLedgerBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/suppliers/{supplierId}/ledger/{entryId}')
    .onCreate(async (snap) => {
        const data = snap.data() || {};
        if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay)) return null;
        
        const createdAt = data.createdAt;
        const businessDay = createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0,10);

        return snap.ref.update({
            businessDay,
            businessDate: businessDayToBusinessDate(businessDay),
            createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        });
    });


export const auditIncomingDateTypes = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'User must be a developer or admin.');
    }
    const { companyId } = data;
    if (!companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    }
    
    const collectionRef = firestore.collection('companies').doc(companyId).collection('incomingProducts');
    const snapshot = await collectionRef.get();
    
    const counts = { stringDates: 0, timestampDates: 0, missingDates: 0, total: snapshot.size };

    snapshot.forEach(doc => {
        const dateValue = doc.data().date || doc.data().incomeDate;
        if (dateValue instanceof admin.firestore.Timestamp) {
            counts.timestampDates++;
        } else if (typeof dateValue === 'string') {
            counts.stringDates++;
        } else {
            counts.missingDates++;
        }
    });

    return counts;
});


export const normalizeIncomingDates = functions.region('us-central1').runWith({ timeoutSeconds: 300 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'User must be a developer or admin.');
    }

    const { companyId, dryRun = true, limit = 500 } = data;
    if (!companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    }

    const collectionRef = firestore.collection('companies').doc(companyId).collection('incomingProducts');
    const snapshot = await collectionRef.limit(limit).get();
    
    const logs: string[] = [];
    let updatedCount = 0;
    const batch = firestore.batch();

    for (const doc of snapshot.docs) {
        const docData = doc.data();
        const updates: Record<string, any> = {};
        
        for (const field of ['date', 'incomeDate', 'createdAt', 'updatedAt', 'businessDate']) {
            const dateVal = docData[field];
            if (typeof dateVal === 'string' && dateVal) {
                const parsedDate = new Date(dateVal);
                if (!isNaN(parsedDate.getTime())) {
                    updates[field] = Timestamp.fromDate(parsedDate);
                }
            }
        }
        
        if (!docData.businessDay || !docData.businessDate) {
            const ts = docData.incomeDate || docData.date || docData.createdAt;
            if (ts) {
                const businessDay = toBusinessDayFromCreatedAt(ts);
                updates.businessDay = businessDay;
                updates.businessDate = businessDayToBusinessDate(businessDay);
            }
        }

        if (Object.keys(updates).length > 0) {
            logs.push(`Will update doc ${doc.id}: ${JSON.stringify(updates)}`);
            updatedCount++;
            if (!dryRun) {
                batch.update(doc.ref, updates);
            }
        }
    }

    if (!dryRun && updatedCount > 0) {
        await batch.commit();
    }

    return { scanned: snapshot.size, updated: updatedCount, logs: logs.slice(0, 100), dryRun };
});

export const backfillBusinessDates = functions
  .region('us-central1')
  .runWith({ timeoutSeconds: 540, memory: '1GB' })
  .https.onCall(async (data, context) => {
    const role = context.auth?.token.role;
    if (role !== 'developer' && role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Developer or admin access required.');
    }

    const { dryRun = true, companyId } = data;
    if (role === 'admin' && (!companyId || companyId !== context.auth?.token.companyId)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin can only run for their own company.');
    }

    const allLogs: string[] = [];
    let totalUpdated = 0;
    
    const companiesSnap = companyId 
        ? [await firestore.collection('companies').doc(companyId).get()] 
        : await firestore.collection('companies').get();

    for (const companyDoc of (companyId ? companiesSnap : companiesSnap.docs)) {
        if (!companyDoc.exists) continue;
        const cid = companyDoc.id;
        allLogs.push(`Processing company ${cid}`);

        const collectionsToProcess = [
            { path: 'dailyExpenses', dateFields: ['createdAt'] },
            { path: 'sales', dateFields: ['date', 'createdAt'] },
            { path: 'incomingProducts', dateFields: ['incomeDate', 'date', 'createdAt'] }
        ];

        for (const { path, dateFields } of collectionsToProcess) {
            const snap = await firestore.collection(`companies/${cid}/${path}`).get();
            for (const doc of snap.docs) {
                const d = doc.data();
                if (d.businessDay && d.businessDate) continue;

                let sourceTs;
                for (const field of dateFields) {
                    if (d[field] instanceof Timestamp) {
                        sourceTs = d[field];
                        break;
                    }
                }
                
                if (sourceTs) {
                    const businessDay = toBusinessDayFromCreatedAt(sourceTs);
                    const updates = { businessDay, businessDate: businessDayToBusinessDate(businessDay) };
                    totalUpdated++;
                    allLogs.push(`  - ${path}/${doc.id}: backfilled`);
                    if (!dryRun) await doc.ref.update(updates);
                }
            }
        }
    }

    return { success: true, dryRun, companiesProcessed: companiesSnap.length, totalUpdated, logs: allLogs.slice(0, 200) };
  });

// existing maintenance functions from user's code
export { createBackup } from './maintenance';
