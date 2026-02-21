"use strict";
// functions/src/maintenance.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBackup = exports.backfillBusinessDates = exports.normalizeIncomingDates = exports.auditIncomingDateTypes = exports.ensureSupplierLedgerBusinessDate = exports.ensureIncomingBusinessDate = exports.ensureSaleBusinessDate = exports.ensureExpenseBusinessDate = exports.ensureLedgerBusinessDate = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
function toBusinessDayFromCreatedAt(ts, tz = 'Asia/Tashkent') {
    const d = ts.toDate();
    // Use en-CA format which produces YYYY-MM-DD
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${day}`;
}
function businessDayToBusinessDate(businessDay) {
    return firestore_1.Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
}
// Firestore Triggers for automatically adding businessDate on new documents
exports.ensureLedgerBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/clients/{clientId}/ledger/{entryId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        return null;
    const createdAt = data.createdAt;
    const businessDay = (createdAt) ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10);
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.ensureExpenseBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/dailyExpenses/{expenseId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        return null;
    const createdAt = data.createdAt;
    const businessDay = (createdAt) ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10);
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.ensureSaleBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/sales/{saleId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        return null;
    const sourceTs = data.date || data.createdAt;
    const businessDay = sourceTs ? toBusinessDayFromCreatedAt(sourceTs) : new Date().toISOString().slice(0, 10);
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.ensureIncomingBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/incomingProducts/{logId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        return null;
    const sourceTs = data.incomeDate || data.date || data.createdAt;
    const businessDay = sourceTs ? toBusinessDayFromCreatedAt(sourceTs) : new Date().toISOString().slice(0, 10);
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.ensureSupplierLedgerBusinessDate = functions
    .region('us-central1')
    .firestore.document('companies/{companyId}/suppliers/{supplierId}/ledger/{entryId}')
    .onCreate(async (snap) => {
    var _a;
    const data = snap.data() || {};
    if (data.businessDate && typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        return null;
    const createdAt = data.createdAt;
    const businessDay = createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10);
    return snap.ref.update({
        businessDay,
        businessDate: businessDayToBusinessDate(businessDay),
        createdAt: (_a = data.createdAt) !== null && _a !== void 0 ? _a : firestore_1.FieldValue.serverTimestamp(),
    });
});
exports.auditIncomingDateTypes = functions.region('us-central1').https.onCall(async (data, context) => {
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
        }
        else if (typeof dateValue === 'string') {
            counts.stringDates++;
        }
        else {
            counts.missingDates++;
        }
    });
    return counts;
});
exports.normalizeIncomingDates = functions.region('us-central1').runWith({ timeoutSeconds: 300 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'User must be a developer or admin.');
    }
    const { companyId, dryRun = true, limit = 500 } = data;
    if (!companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    }
    const collectionRef = firestore.collection('companies').doc(companyId).collection('incomingProducts');
    const snapshot = await collectionRef.limit(limit).get();
    const logs = [];
    let updatedCount = 0;
    const batch = firestore.batch();
    for (const doc of snapshot.docs) {
        const docData = doc.data();
        const updates = {};
        for (const field of ['date', 'incomeDate', 'createdAt', 'updatedAt', 'businessDate']) {
            const dateVal = docData[field];
            if (typeof dateVal === 'string' && dateVal) {
                const parsedDate = new Date(dateVal);
                if (!isNaN(parsedDate.getTime())) {
                    updates[field] = firestore_1.Timestamp.fromDate(parsedDate);
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
exports.backfillBusinessDates = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onCall(async (data, context) => {
    var _a, _b;
    const role = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token.role;
    if (role !== 'developer' && role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Developer or admin access required.');
    }
    const { dryRun = true, companyId } = data;
    if (role === 'admin' && (!companyId || companyId !== ((_b = context.auth) === null || _b === void 0 ? void 0 : _b.token.companyId))) {
        throw new functions.https.HttpsError('permission-denied', 'Admin can only run for their own company.');
    }
    const allLogs = [];
    let totalUpdated = 0;
    const companiesSnap = companyId
        ? [await firestore.collection('companies').doc(companyId).get()]
        : await firestore.collection('companies').get();
    const companyDocs = Array.isArray(companiesSnap) ? companiesSnap : companiesSnap.docs;
    for (const companyDoc of companyDocs) {
        if (!companyDoc.exists)
            continue;
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
                if (d.businessDay && d.businessDate)
                    continue;
                let sourceTs;
                for (const field of dateFields) {
                    if (d[field] instanceof firestore_1.Timestamp) {
                        sourceTs = d[field];
                        break;
                    }
                }
                if (sourceTs) {
                    const businessDay = toBusinessDayFromCreatedAt(sourceTs);
                    const updates = { businessDay, businessDate: businessDayToBusinessDate(businessDay) };
                    totalUpdated++;
                    allLogs.push(`  - ${path}/${doc.id}: backfilled`);
                    if (!dryRun)
                        await doc.ref.update(updates);
                }
            }
        }
    }
    return { success: true, dryRun, companiesProcessed: companyDocs.length, totalUpdated, logs: allLogs.slice(0, 200) };
});
exports.createBackup = functions
    .region("us-central1")
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https.onCall(async (data, context) => {
    var _a, _b;
    const role = (_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.role;
    if (role !== "developer") {
        throw new functions.https.HttpsError("permission-denied", "Developer access required.");
    }
    const { companyId, collections } = data;
    if (!companyId || !Array.isArray(collections) || collections.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "companyId and a non-empty collections array are required.");
    }
    const backupTimestamp = new Date().toISOString().replace(/:/g, "-");
    const backupPrefix = `backups/${companyId}/${backupTimestamp}`;
    const summary = {};
    for (const coll of collections) {
        const originalPath = `companies/${companyId}/${coll}`;
        const backupPath = `${backupPrefix}/${coll}`;
        const originalDocs = await firestore.collection(originalPath).get();
        summary[coll] = originalDocs.size;
        if (originalDocs.empty)
            continue;
        // Batch write the backed-up documents
        const chunks = [];
        for (let i = 0; i < originalDocs.docs.length; i += 450) {
            chunks.push(originalDocs.docs.slice(i, i + 450));
        }
        for (const chunk of chunks) {
            const batch = firestore.batch();
            for (const doc of chunk) {
                const backupDocRef = firestore.collection(backupPath).doc(doc.id);
                batch.set(backupDocRef, doc.data());
            }
            await batch.commit();
        }
    }
    return { success: true, message: `Backup created at ${backupPrefix}`, summary };
});
//# sourceMappingURL=maintenance.js.map