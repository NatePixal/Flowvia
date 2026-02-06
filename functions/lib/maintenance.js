"use strict";
// functions/src/maintenance.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIncomingDates = exports.createBackup = exports.auditIncomingDateTypes = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
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
//# sourceMappingURL=maintenance.js.map