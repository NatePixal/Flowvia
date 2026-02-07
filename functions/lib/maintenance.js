"use strict";
// functions/src/maintenance.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillBusinessDates = exports.normalizeIncomingDates = exports.createBackup = exports.auditIncomingDateTypes = exports.ensureExpenseBusinessDate = exports.ensureLedgerBusinessDate = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
function toBusinessDayFromCreatedAt(ts, tz = 'Asia/Tashkent') {
    const d = ts.toDate();
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${day}`; // YYYY-MM-DD
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
    if (data.businessDate)
        return null;
    const createdAt = data.createdAt;
    const businessDay = (typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        ? data.businessDay
        : (createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10));
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
    if (data.businessDate)
        return null;
    const createdAt = data.createdAt;
    const businessDay = (typeof data.businessDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.businessDay))
        ? data.businessDay
        : (createdAt ? toBusinessDayFromCreatedAt(createdAt) : new Date().toISOString().slice(0, 10));
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
    const counts = { timestamp: 0, string: 0, other: 0, invalidOrMissing: 0 };
    const stringDateSamples = [];
    let failedQueryError = null;
    try {
        await collectionRef.orderBy('date', 'asc').limit(1).get();
    }
    catch (e) {
        failedQueryError = e.message;
    }
    const snapshot = await collectionRef.get();
    snapshot.forEach(doc => {
        const dateValue = doc.data().date;
        if (dateValue instanceof admin.firestore.Timestamp) {
            counts.timestamp++;
        }
        else if (typeof dateValue === 'string') {
            counts.string++;
            if (stringDateSamples.length < 5) {
                stringDateSamples.push({ id: doc.id, date: dateValue });
            }
        }
        else if (dateValue) {
            counts.other++;
        }
        else {
            counts.invalidOrMissing++;
        }
    });
    return {
        counts,
        stringDateSamples,
        failedQuery: `db.collection('companies/${companyId}/incomingProducts').orderBy('date', 'asc')`,
        error: failedQueryError,
    };
});
exports.createBackup = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'User must be a developer or admin.');
    }
    const { companyId, collections, force = false } = data;
    if (!companyId || !Array.isArray(collections)) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId or collections array.');
    }
    const dateSuffix = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const results = [];
    for (const coll of collections) {
        const sourceRef = firestore.collection('companies').doc(companyId).collection(coll);
        const backupCollName = `${coll}_backup_${dateSuffix}`;
        const backupRef = firestore.collection('companies').doc(companyId).collection(backupCollName);
        const existingBackupSnap = await backupRef.limit(1).get();
        if (!existingBackupSnap.empty && !force) {
            results.push({
                collection: coll,
                status: 'skipped',
                message: `Backup collection ${backupCollName} already exists. Use force:true to overwrite.`
            });
            continue;
        }
        const sourceSnap = await sourceRef.get();
        const sourceCount = sourceSnap.size;
        const batch = firestore.batch();
        sourceSnap.docs.forEach(doc => {
            batch.set(backupRef.doc(doc.id), doc.data());
        });
        await batch.commit();
        const backupCount = (await backupRef.get()).size;
        results.push({
            collection: coll,
            status: sourceCount === backupCount ? 'success' : 'verification_failed',
            sourceCount,
            backupCount,
            backupCollection: backupCollName
        });
    }
    return { success: true, results };
});
exports.normalizeIncomingDates = functions.region('us-central1').runWith({ timeoutSeconds: 300 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'User must be a developer or admin.');
    }
    const { companyId, dryRun = true, pageSize = 400, startAfterDocId = null, writeParseErrors = true, } = data;
    if (!companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing companyId.');
    }
    let query = firestore.collection('companies').doc(companyId).collection('incomingProducts')
        .orderBy(admin.firestore.FieldPath.documentId());
    if (startAfterDocId) {
        query = query.startAfter(startAfterDocId);
    }
    const snapshot = await query.limit(pageSize).get();
    if (snapshot.empty) {
        return { message: "No more documents to process.", processedCount: 0, updatedCount: 0, errorCount: 0, nextStartAfterDocId: null };
    }
    let batch = firestore.batch();
    let processedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let lastDocId = '';
    for (const doc of snapshot.docs) {
        processedCount++;
        lastDocId = doc.id;
        const docData = doc.data();
        const dateVal = docData.date;
        if (dateVal instanceof admin.firestore.Timestamp) {
            continue; // Already a Timestamp, skip it
        }
        if (typeof dateVal === 'string' && dateVal) {
            let parsedDate = null;
            // Regex for YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
                parsedDate = new Date(`${dateVal}T00:00:00Z`); // Treat as UTC midnight
            }
            // Regex for ISO 8601 with 'T'
            else if (dateVal.includes('T')) {
                parsedDate = new Date(dateVal);
            }
            if (parsedDate && !isNaN(parsedDate.getTime())) {
                updatedCount++;
                if (!dryRun) {
                    batch.update(doc.ref, {
                        date: admin.firestore.Timestamp.fromDate(parsedDate),
                        dateOriginalString: dateVal,
                        dateNormalizedAt: admin.firestore.FieldValue.serverTimestamp(),
                        dateParseError: admin.firestore.FieldValue.delete(),
                    });
                }
            }
            else {
                errorCount++;
                if (!dryRun && writeParseErrors) {
                    batch.update(doc.ref, {
                        dateParseError: `Unparseable date string: "${dateVal}"`,
                        dateParseErrorAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }
        }
    }
    if (!dryRun && updatedCount + errorCount > 0) {
        await batch.commit();
    }
    return {
        processedCount,
        updatedCount,
        errorCount,
        nextStartAfterDocId: snapshot.docs.length < pageSize ? null : lastDocId
    };
});
exports.backfillBusinessDates = functions
    .region('us-central1')
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onCall(async (data, context) => {
    var _a, _b;
    if (((_b = (_a = context.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.role) !== 'developer') {
        throw new functions.https.HttpsError('permission-denied', 'Developer access required.');
    }
    const { dryRun = true } = data;
    const allLogs = [];
    const totalCounts = {
        expenses: { processed: 0, updated: 0 },
        sales: { processed: 0, updated: 0 },
        clientLedgers: { processed: 0, updated: 0 },
        supplierLedgers: { processed: 0, updated: 0 },
        incomingProducts: { processed: 0, updated: 0 },
    };
    const companiesSnap = await firestore.collection('companies').get();
    allLogs.push(`Found ${companiesSnap.size} companies to process.`);
    for (const companyDoc of companiesSnap.docs) {
        const companyId = companyDoc.id;
        const companyName = companyDoc.data().name || 'No Name';
        allLogs.push(`--- Processing Company: ${companyId} (${companyName}) ---`);
        const counts = {
            expenses: { processed: 0, updated: 0 },
            sales: { processed: 0, updated: 0 },
            clientLedgers: { processed: 0, updated: 0 },
            supplierLedgers: { processed: 0, updated: 0 },
            incomingProducts: { processed: 0, updated: 0 },
        };
        const batchSize = 400;
        async function processCollection(collectionPath, dateFields, category) {
            const collectionRef = firestore.collection(`companies/${companyId}/${collectionPath}`);
            const snapshot = await collectionRef.get();
            let writeCount = 0;
            let batch = firestore.batch();
            for (const doc of snapshot.docs) {
                counts[category].processed++;
                const docData = doc.data();
                if (docData.businessDate)
                    continue;
                let sourceDate = null;
                for (const field of dateFields) {
                    if (docData[field]) {
                        const d = docData[field];
                        if (d instanceof admin.firestore.Timestamp) {
                            sourceDate = d.toDate();
                            break;
                        }
                        if (d instanceof Date) {
                            sourceDate = d;
                            break;
                        }
                        if (typeof d === 'string' || typeof d === 'number') {
                            const parsed = new Date(d);
                            if (!isNaN(parsed.getTime())) {
                                sourceDate = parsed;
                                break;
                            }
                        }
                    }
                }
                if (sourceDate) {
                    const y = sourceDate.getUTCFullYear();
                    const m = String(sourceDate.getUTCMonth() + 1).padStart(2, '0');
                    const d = String(sourceDate.getUTCDate()).padStart(2, '0');
                    const businessDay = `${y}-${m}-${d}`;
                    const businessDate = admin.firestore.Timestamp.fromDate(new Date(`${businessDay}T00:00:00.000Z`));
                    counts[category].updated++;
                    if (!dryRun) {
                        batch.update(doc.ref, { businessDay, businessDate });
                        writeCount++;
                        if (writeCount >= batchSize) {
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
            allLogs.push(`  ${collectionPath}: Processed ${counts[category].processed}, Found-To-Update ${counts[category].updated}`);
        }
        async function processSubCollections(parentCollection, subCollection, dateFields, category) {
            const parentDocs = await firestore.collection(`companies/${companyId}/${parentCollection}`).get();
            for (const parentDoc of parentDocs.docs) {
                await processCollection(`${parentCollection}/${parentDoc.id}/${subCollection}`, dateFields, category);
            }
        }
        await processCollection('dailyExpenses', ['date', 'createdAt'], 'expenses');
        await processCollection('sales', ['date', 'createdAt'], 'sales');
        await processCollection('incomingProducts', ['incomeDate', 'date', 'createdAt'], 'incomingProducts');
        await processSubCollections('clients', 'ledger', ['purchaseDate', 'createdAt'], 'clientLedgers');
        await processSubCollections('suppliers', 'ledger', ['createdAt'], 'supplierLedgers');
        for (const key of Object.keys(totalCounts)) {
            const cat = key;
            totalCounts[cat].processed += counts[cat].processed;
            totalCounts[cat].updated += counts[cat].updated;
        }
    }
    return {
        success: true,
        dryRun,
        companiesProcessed: companiesSnap.size,
        logs: allLogs,
        counts: totalCounts
    };
});
//# sourceMappingURL=maintenance.js.map