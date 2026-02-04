"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeIncomingDates = exports.createBackup = exports.auditIncomingDateTypes = exports.recalculateAllClientBalances = exports.migrateProductsToMinorUnits = exports.auditFinancials = exports.deepRepairFinancials = exports.recalculateSalesFinancials = exports.fixCurrentUserClaims = exports.repairCurrentUserClaims = exports.initializeCompany = exports.backfillClaims = exports.repairMyClaims = exports.deleteUserFromCompany = exports.inviteUserToCompany = exports.onUserUpdated = exports.createUserAndCompany = void 0;
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
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
__exportStar(require("./money"), exports);
var financials_1 = require("./financials");
Object.defineProperty(exports, "recalculateSalesFinancials", { enumerable: true, get: function () { return financials_1.recalculateSalesFinancials; } });
Object.defineProperty(exports, "deepRepairFinancials", { enumerable: true, get: function () { return financials_1.deepRepairFinancials; } });
Object.defineProperty(exports, "auditFinancials", { enumerable: true, get: function () { return financials_1.auditFinancials; } });
Object.defineProperty(exports, "migrateProductsToMinorUnits", { enumerable: true, get: function () { return financials_1.migrateProductsToMinorUnits; } });
Object.defineProperty(exports, "recalculateAllClientBalances", { enumerable: true, get: function () { return financials_1.recalculateAllClientBalances; } });
var maintenance_1 = require("./maintenance");
Object.defineProperty(exports, "auditIncomingDateTypes", { enumerable: true, get: function () { return maintenance_1.auditIncomingDateTypes; } });
Object.defineProperty(exports, "createBackup", { enumerable: true, get: function () { return maintenance_1.createBackup; } });
Object.defineProperty(exports, "normalizeIncomingDates", { enumerable: true, get: function () { return maintenance_1.normalizeIncomingDates; } });
__exportStar(require("./exports/index"), exports);
//# sourceMappingURL=index.js.map