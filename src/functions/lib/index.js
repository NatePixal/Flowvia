
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepRepairFinancials = exports.recalculateSalesFinancials = exports.migrateProductsToMinorUnits = exports.auditFinancials = exports.normalizeIncomingDates = exports.createBackup = exports.auditIncomingDateTypes = exports.fixCurrentUserClaims = exports.repairCurrentUserClaims = exports.initializeCompany = exports.backfillClaims = exports.repairMyClaims = exports.deleteUserFromCompany = exports.inviteUserToCompany = exports.onUserUpdated = exports.createUserAndCompany = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const money_1 = require("./money");
// Defensive init: only initialize if not already initialized by the environment.
if (!admin.apps.length) {
    admin.initializeApp();
}
// Global Firestore setting to prevent crashes on undefined values.
admin.firestore().settings({ ignoreUndefinedProperties: true });
const firestore = admin.firestore();
/**
 * A reusable helper function to safely merge new custom claims with existing ones.
 * @param userId The UID of the user to update.
 * @param newClaims An object containing the new claims to set.
 */
async function setMergedCustomClaims(userId, newClaims) {
    const userRecord = await admin.auth().getUser(userId);
    const existingClaims = userRecord.customClaims || {};
    const merged = Object.assign(Object.assign({}, existingClaims), newClaims);
    await admin.auth().setCustomUserClaims(userId, merged);
    console.log(`setMergedCustomClaims for ${userId}:`, merged);
}
exports.createUserAndCompany = functions
    .region('us-central1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const uid = context.auth.uid;
    const { companyName = 'Untitled Company', displayName = '' } = data || {};
    // Always pull stable identity info from the user record (not token)
    const userRecord = await admin.auth().getUser(uid);
    const safeEmail = (_a = userRecord.email) !== null && _a !== void 0 ? _a : '';
    const safeName = displayName || userRecord.displayName || '';
    const userRole = 'admin';
    try {
        // Create company doc
        const companyRef = await firestore.collection('companies').add({
            name: companyName,
            ownerId: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            baseCurrency: 'USD'
        });
        const companyId = companyRef.id;
        // Ensure user doc exists / merge details
        const userRef = firestore.collection('users').doc(uid);
        await userRef.set({
            email: safeEmail,
            name: safeName,
            companyId,
            role: userRole,
            isPaid: false,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Set custom claims using the new safe helper
        await setMergedCustomClaims(uid, { companyId, role: userRole });
        return { success: true, companyId };
    }
    catch (err) {
        console.error('createUserAndCompany error:', err);
        throw new functions.https.HttpsError('internal', (err === null || err === void 0 ? void 0 : err.message) || 'Internal error while creating user/company.');
    }
});
/**
 * Firestore trigger that keeps auth custom claims in sync when a user's document is updated.
 * If companyId or role changes in /users/{userId}, update the custom claims in Firebase Auth.
 */
exports.onUserUpdated = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const userId = context.params.userId;
    try {
        const companyBefore = before.companyId || null;
        const roleBefore = before.role || null;
        const companyAfter = after.companyId || null;
        const roleAfter = after.role || null;
        // Only touch claims if companyId or role actually changed
        if (companyBefore !== companyAfter || roleBefore !== roleAfter) {
            // Build the *new* claims we want to enforce
            const newClaims = {};
            if (roleAfter === 'developer') {
                // Developer Invariant: companyId MUST be null for developers.
                newClaims.companyId = null;
            }
            else if (companyAfter) {
                // For non-developers, use the companyId from the document.
                newClaims.companyId = companyAfter;
            }
            else if (roleAfter !== 'developer' && companyBefore) {
                // Handle case where company is removed from a non-developer
                newClaims.companyId = null;
            }
            if (roleAfter) {
                newClaims.role = roleAfter;
            }
            // If we actually have something to update, MERGE with existing claims
            if (Object.keys(newClaims).length > 0) {
                await setMergedCustomClaims(userId, newClaims);
            }
        }
    }
    catch (err) {
        console.error('onUserUpdated error:', err);
        // Do not throw — this is a background trigger. Log and continue.
    }
});
/**
 * Invites a user to the calling admin's company.
 * Uses onCall to ensure the caller is an authenticated admin.
 */
exports.inviteUserToCompany = functions.https.onCall(async (data, context) => {
    // 1. Authentication and Authorization Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to invite users.');
    }
    const callerClaims = context.auth.token;
    if (callerClaims.role !== 'admin' && callerClaims.role !== 'developer') {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin to invite users.');
    }
    // 2. Input Validation
    const { name, email, password, role, companyId } = data;
    if (!name || !email || !password || !role || !companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields.');
    }
    // Security Check: Ensure admin is inviting user to their own company
    if (callerClaims.role !== 'developer' && callerClaims.companyId !== companyId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only invite users to your own company.');
    }
    try {
        // 3. Create the new user in Firebase Auth
        const userRecord = await admin.auth().createUser({ email, password, displayName: name });
        const uid = userRecord.uid;
        // 4. Create the user's profile and add them to the company in a transaction
        const userRef = admin.firestore().collection('users').doc(uid);
        const companyRef = admin.firestore().collection('companies').doc(companyId);
        await admin.firestore().runTransaction(async (transaction) => {
            var _a;
            transaction.set(userRef, {
                name: name,
                email,
                companyId,
                role,
                status: "active",
                isPaid: true, // Assuming invited users are paid
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid,
            });
            transaction.update(companyRef, {
                memberUids: admin.firestore.FieldValue.arrayUnion(uid)
            });
        });
        // 5. Set custom claims for the new user (merge-safe)
        const claimsToSet = { role };
        if (role === 'developer') {
            claimsToSet.companyId = null;
        }
        else {
            claimsToSet.companyId = companyId;
        }
        await setMergedCustomClaims(uid, claimsToSet);
        // 6. Return success
        return { success: true, uid: userRecord.uid };
    }
    catch (error) {
        console.error('Error in inviteUserToCompany:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to invite user.');
    }
});
exports.deleteUserFromCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to delete users.');
    }
    const callerClaims = context.auth.token;
    if (callerClaims.role !== 'admin' && callerClaims.role !== 'developer') {
        throw new functions.https.HttpsError('permission-denied', 'You must be an admin to delete users.');
    }
    const { userId, companyId } = data;
    if (!userId || !companyId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: userId and companyId.');
    }
    if (callerClaims.uid === userId) {
        throw new functions.https.HttpsError('permission-denied', 'You cannot delete your own account.');
    }
    if (callerClaims.role !== 'developer' && callerClaims.companyId !== companyId) {
        throw new functions.https.HttpsError('permission-denied', 'You can only delete users from your own company.');
    }
    try {
        const userToDeleteRef = admin.firestore().collection('users').doc(userId);
        const userToDeleteDoc = await userToDeleteRef.get();
        if (!userToDeleteDoc.exists) {
            // If user doc doesn't exist, still try to delete from Auth just in case
            await admin.auth().deleteUser(userId);
            return { success: true, message: 'User deleted from Auth. Profile document not found.' };
        }
        const userToDeleteData = userToDeleteDoc.data();
        if ((userToDeleteData === null || userToDeleteData === void 0 ? void 0 : userToDeleteData.companyId) !== companyId) {
            throw new functions.https.HttpsError('permission-denied', 'The specified user does not belong to your company.');
        }
        // Perform deletions
        await admin.auth().deleteUser(userId);
        await userToDeleteRef.delete();
        return { success: true, message: 'User successfully deleted.' };
    }
    catch (error) {
        console.error('Error in deleteUserFromCompany:', error);
        if (error.code === 'auth/user-not-found') {
            return { success: true, message: 'User already deleted from Auth.' };
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to delete user.');
    }
});
exports.repairMyClaims = functions
    .region('us-central1')
    .https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated.');
    }
    const uid = context.auth.uid;
    const snap = await admin.firestore().doc(`users/${uid}`).get();
    if (!snap.exists) {
        throw new functions.https.HttpsError('failed-precondition', 'User profile not found.');
    }
    const userData = snap.data();
    const companyIdFromDoc = userData.companyId;
    const role = userData.role;
    if (!role) {
        throw new functions.https.HttpsError('failed-precondition', 'User role missing in profile.');
    }
    // Prepare claims based on role
    const claimsToSet = {
        role: role,
        companyId: null
    };
    if (role === 'developer') {
        // Developer Invariant: companyId must be null.
        claimsToSet.companyId = null;
    }
    else {
        // Non-developer MUST have a companyId in their doc.
        if (!companyIdFromDoc) {
            throw new functions.https.HttpsError('failed-precondition', 'User profile is missing companyId.');
        }
        claimsToSet.companyId = companyIdFromDoc;
    }
    await admin.auth().setCustomUserClaims(uid, claimsToSet);
    return { success: true, role: claimsToSet.role, companyId: claimsToSet.companyId };
});
exports.backfillClaims = functions
    .region('us-central1')
    .https.onCall(async (_data, context) => {
    if (!context.auth || context.auth.token.role !== 'developer') {
        throw new functions.https.HttpsError('permission-denied', 'Only developers can run backfill.');
    }
    const usersSnap = await admin.firestore().collection('users').get();
    let updated = 0;
    let skipped = 0;
    for (const docSnap of usersSnap.docs) {
        const user = docSnap.data();
        const uid = docSnap.id;
        const role = user.role;
        const companyIdFromDoc = user.companyId;
        const claimsToSet = {
            role: role,
            companyId: null
        };
        if (!role) {
            skipped++;
            continue;
        }
        if (role === 'developer') {
            claimsToSet.companyId = null;
        }
        else {
            if (!companyIdFromDoc) {
                skipped++;
                continue;
            }
            claimsToSet.companyId = companyIdFromDoc;
        }
        await admin.auth().setCustomUserClaims(uid, claimsToSet);
        updated++;
    }
    return { success: true, updated, skipped };
});
exports.initializeCompany = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { uid, token } = context.auth;
    const { companyId, role, name: userName } = token;
    if (role !== 'admin' && role !== 'developer') {
        throw new functions.https.HttpsError('permission-denied', 'User must be an admin or developer.');
    }
    if (!companyId) {
        throw new functions.https.HttpsError('failed-precondition', 'No companyId found in user claims.');
    }
    const ALLOWED_CURRENCIES = ["USD", "UZS", "AED", "CNY"];
    const baseCurrency = ALLOWED_CURRENCIES.includes(data === null || data === void 0 ? void 0 : data.baseCurrency) ? data.baseCurrency : 'USD';
    try {
        const companyRef = firestore.collection('companies').doc(companyId);
        const companyData = {
            name: (data === null || data === void 0 ? void 0 : data.name) || userName || 'My Company',
            ownerId: uid,
            userCount: 1,
            baseCurrency: baseCurrency,
            warehouseCapacity: 0,
            warehouseCapacityType: 'units',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await companyRef.set(companyData, { merge: true });
        return { success: true, companyId: companyRef.id };
    }
    catch (err) {
        console.error('initializeCompany error:', err);
        throw new functions.https.HttpsError('internal', err.message || 'Failed to initialize company document.');
    }
});
// DEPRECATED - Combined into repairMyClaims
exports.repairCurrentUserClaims = functions.https.onCall(async (data, context) => {
    throw new functions.https.HttpsError('unimplemented', 'This function is deprecated. Use repairMyClaims instead.');
});
// DEPRECATED - Combined into repairMyClaims
exports.fixCurrentUserClaims = functions.https.onCall(async (data, context) => {
    throw new functions.https.HttpsError('unimplemented', 'This function is deprecated. Use repairMyClaims instead.');
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
// Financial Migration Tools
exports.auditFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer required.');
    }
    const { companyId } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    const productsRef = firestore.collection(`companies/${companyId}/products`);
    const salesRef = firestore.collection(`companies/${companyId}/sales`);
    const productsSnap = await productsRef.get();
    let productsMissingMinor = 0;
    for (const doc of productsSnap.docs) {
        const p = doc.data();
        if (typeof p.costMinor !== 'number' || typeof p.costBaseMinor !== 'number') {
            productsMissingMinor++;
        }
    }
    const salesSnap = await salesRef.get();
    let salesMissingMinor = 0;
    for (const doc of salesSnap.docs) {
        const s = doc.data();
        if (typeof s.revenueMinor !== 'number' || typeof s.grossProfitBaseMinor !== 'number') {
            salesMissingMinor++;
        }
    }
    return {
        totalProducts: productsSnap.size,
        productsMissingMinor,
        totalSales: salesSnap.size,
        salesMissingMinor,
    };
});
exports.migrateProductsToMinorUnits = functions.region('us-central1').https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer required.');
    }
    const { companyId, dryRun = true } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    if (!companySnap.exists)
        throw new functions.https.HttpsError('not-found', 'Company not found.');
    const company = companySnap.data();
    const baseCurrency = company.baseCurrency || 'USD';
    const productsRef = firestore.collection(`companies/${companyId}/products`);
    const productsSnap = await productsRef.get();
    let updatedCount = 0;
    let skippedCount = 0;
    const batch = firestore.batch();
    for (const doc of productsSnap.docs) {
        const product = doc.data();
        const purchaseCurrency = product.purchasePriceCurrency;
        if (!purchaseCurrency) {
            skippedCount++;
            continue;
        }
        const costMinor = (0, money_1.toMinor)(product.cost, purchaseCurrency);
        let costBaseMinor;
        if (purchaseCurrency === baseCurrency) {
            costBaseMinor = costMinor;
        }
        else {
            // Cannot reliably convert without FX rate. Skip this product.
            skippedCount++;
            continue;
        }
        updatedCount++;
        if (!dryRun) {
            batch.update(doc.ref, { costMinor, costBaseMinor, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        }
    }
    if (!dryRun)
        await batch.commit();
    return {
        totalProducts: productsSnap.size,
        updatedCount,
        skippedCount,
        dryRun,
        message: dryRun ? "Dry run complete." : "Migration applied.",
    };
});
exports.recalculateSalesFinancials = functions.region('us-central1').https.onCall(async (data, context) => {
    var _a;
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer required.');
    }
    const { companyId, dryRun = true } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    if (!companySnap.exists)
        throw new functions.https.HttpsError('not-found', 'Company not found.');
    const company = companySnap.data();
    const baseCurrency = company.baseCurrency || 'USD';
    const salesRef = firestore.collection(`companies/${companyId}/sales`);
    const salesSnap = await salesRef.get();
    let updatedCount = 0;
    let skippedCount = 0;
    const batch = firestore.batch();
    for (const doc of salesSnap.docs) {
        const sale = doc.data();
        const productRef = firestore.doc(`companies/${companyId}/products/${sale.productId}`);
        const productSnap = await productRef.get();
        if (!productSnap.exists) {
            skippedCount++;
            continue;
        }
        const product = productSnap.data();
        if (typeof product.costBaseMinor !== 'number') {
            skippedCount++;
            continue;
        }
        const salePriceCurrency = sale.salePriceCurrency;
        const revenueMinor = (0, money_1.toMinor)(sale.salePrice * sale.quantity, salePriceCurrency);
        const costOfGoodsSoldBaseMinor = product.costBaseMinor * sale.quantity;
        let revenueBaseMinor = revenueMinor;
        if (salePriceCurrency !== baseCurrency && ((_a = sale.fx) === null || _a === void 0 ? void 0 : _a.rateToBase)) {
            const txnMajor = (0, money_1.fromMinor)(revenueMinor, salePriceCurrency);
            const baseMajor = txnMajor * sale.fx.rateToBase;
            revenueBaseMinor = (0, money_1.toMinor)(baseMajor, baseCurrency);
        }
        const grossProfitBaseMinor = revenueBaseMinor - costOfGoodsSoldBaseMinor;
        updatedCount++;
        if (!dryRun) {
            batch.update(doc.ref, {
                revenueMinor,
                revenueBaseMinor,
                costOfGoodsSoldBaseMinor,
                grossProfitBaseMinor,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
    if (!dryRun)
        await batch.commit();
    return {
        totalSales: salesSnap.size,
        updatedCount,
        skippedCount,
        dryRun,
        message: dryRun ? "Dry run complete." : "Recalculation applied.",
    };
});
// New Deep Repair function
exports.deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer required.');
    }
    const { companyId, dryRun = false } = data;
    if (!companyId)
        throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    if (!companySnap.exists)
        throw new functions.https.HttpsError('not-found', 'Company not found.');
    const company = companySnap.data();
    const baseCurrency = company.baseCurrency || 'USD';
    const productsRef = firestore.collection(`companies/${companyId}/products`);
    const salesRef = firestore.collection(`companies/${companyId}/sales`);
    // --- Step 1: Find and Repair Products ---
    const productsSnap = await productsRef.get();
    const productsToRepair = productsSnap.docs.filter(doc => {
        const p = doc.data();
        return typeof p.costBaseMinor !== 'number';
    });
    let productsRepairedCount = 0;
    if (productsToRepair.length > 0) {
        const repairBatch = firestore.batch();
        for (const doc of productsToRepair) {
            const product = doc.data();
            const purchaseCurrency = product.purchasePriceCurrency || baseCurrency;
            // Default cost to 0 as a safe fallback.
            const costMinor = (0, money_1.toMinor)(product.cost || 0, purchaseCurrency);
            const costBaseMinor = (purchaseCurrency === baseCurrency)
                ? costMinor
                : 0; // Cannot determine base cost without FX, so default to 0.
            if (!dryRun) {
                repairBatch.update(doc.ref, {
                    costMinor,
                    costBaseMinor,
                    repairedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
            productsRepairedCount++;
        }
        if (!dryRun)
            await repairBatch.commit();
    }
    // --- Step 2: Recalculate All Sales ---
    // Refetch all products to get the repaired versions
    const allProductsSnap = await productsRef.get();
    const productsById = new Map();
    allProductsSnap.forEach(doc => productsById.set(doc.id, doc.data()));
    const allSalesSnap = await salesRef.get();
    let salesRecalculatedCount = 0;
    let salesSkippedCount = 0;
    const salesBatch = firestore.batch();
    for (const doc of allSalesSnap.docs) {
        const sale = doc.data();
        const product = productsById.get(sale.productId);
        if (!product || typeof product.costBaseMinor !== 'number') {
            salesSkippedCount++;
            continue;
        }
        const salePriceCurrency = sale.salePriceCurrency;
        const revenueMinor = (0, money_1.toMinor)((sale.salePrice || 0) * (sale.quantity || 0), salePriceCurrency);
        const costOfGoodsSoldBaseMinor = product.costBaseMinor * (sale.quantity || 0);
        let revenueBaseMinor = revenueMinor;
        if (salePriceCurrency !== baseCurrency && sale.fx?.rateToBase) {
            const txnMajor = (0, money_1.fromMinor)(revenueMinor, salePriceCurrency);
            const baseMajor = txnMajor * sale.fx.rateToBase;
            revenueBaseMinor = (0, money_1.toMinor)(baseMajor, baseCurrency);
        }
        else if (salePriceCurrency !== baseCurrency) {
            // Cannot convert revenue, so cannot calculate base profit.
            // Set base profit to null or another indicator.
            revenueBaseMinor = 0; // Or handle as you see fit
        }
        const grossProfitBaseMinor = revenueBaseMinor - costOfGoodsSoldBaseMinor;
        // Also calculate local currency profit
        let costOfGoodsSoldMinor;
        if (salePriceCurrency === baseCurrency) {
            costOfGoodsSoldMinor = costOfGoodsSoldBaseMinor;
        }
        else if (sale.fx?.rateToBase) {
            costOfGoodsSoldMinor = (0, money_1.convertBaseToMinor)(costOfGoodsSoldBaseMinor, sale.fx.rateToBase, salePriceCurrency, baseCurrency);
        }
        else {
            costOfGoodsSoldMinor = 0; // Cannot determine local COGS
        }
        const grossProfitMinor = revenueMinor - costOfGoodsSoldMinor;
        salesRecalculatedCount++;
        if (!dryRun) {
            salesBatch.update(doc.ref, {
                revenueMinor,
                revenueBaseMinor,
                costOfGoodsSoldBaseMinor,
                grossProfitBaseMinor,
                costOfGoodsSoldMinor,
                grossProfitMinor,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }
    if (!dryRun)
        await salesBatch.commit();
    return {
        dryRun,
        productsFoundToRepair: productsToRepair.length,
        productsRepaired: productsRepairedCount,
        salesInspected: allSalesSnap.size,
        salesRecalculated: salesRecalculatedCount,
        salesSkipped: salesSkippedCount,
        message: "Deep repair process complete."
    };
});
//# sourceMappingURL=index.js.map
