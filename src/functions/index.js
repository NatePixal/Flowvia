"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteUserToCompany = exports.onUserUpdated = exports.createUserAndCompany = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Defensive init: only initialize if not already initialized by the environment.
if (!admin.apps.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();
/**
 * Callable function used by the client after a new user signs in (or when an admin creates a user).
 * Expects data: { companyName?: string, displayName?: string }
 * Requires: context.auth (user must be signed in when calling it).
 *
 * This function:
 * - creates a company doc
 * - writes/merges a users/{uid} document with companyId and role
 * - sets custom claims (companyId, role) on the user auth record
 */
exports.createUserAndCompany = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated to call this function.');
    }
    const uid = context.auth.uid;
    const { companyName = 'Untitled Company', displayName = '' } = data || {};
    try {
        // Create company doc
        const companyRef = await firestore.collection('companies').add({
            name: companyName,
            ownerId: uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const companyId = companyRef.id;
        // Ensure user doc exists / merge details
        const userRef = firestore.collection('users').doc(uid);
        await userRef.set({
            name: displayName || context.auth.token.name || '',
            email: context.auth.token.email || '',
            companyId,
            role: 'admin',
            status: 'active',
            isPaid: true, // Default to paid on creation
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        // Set custom claims on the user so rules will accept queries that depend on request.auth.token.companyId
        await admin.auth().setCustomUserClaims(uid, { companyId, role: 'admin' });
        console.log(`Successfully created company ${companyId} and claims for user ${uid}`);
        return { success: true, companyId };
    }
    catch (err) {
        console.error('createUserAndCompany error:', err);
        throw new functions.https.HttpsError('internal', err?.message || 'Internal error while creating user/company.');
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
        if (companyBefore !== companyAfter || roleBefore !== roleAfter) {
            // Only set claims when they changed.
            const claims = {};
            if (companyAfter)
                claims.companyId = companyAfter;
            if (roleAfter)
                claims.role = roleAfter;
            await admin.auth().setCustomUserClaims(userId, claims);
            console.log(`Updated custom claims for ${userId}:`, claims);
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
            transaction.set(userRef, {
                name: name,
                email,
                companyId,
                role,
                status: "active",
                isPaid: true, // Assuming invited users are paid
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: context.auth?.uid,
            });
            transaction.update(companyRef, {
                memberUids: admin.firestore.FieldValue.arrayUnion(uid)
            });
        });
        // 5. Set custom claims for the new user
        await admin.auth().setCustomUserClaims(uid, { companyId, role });
        // 6. Return success
        return { success: true, uid: userRecord.uid };
    }
    catch (error) {
        console.error('Error in inviteUserToCompany:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to invite user.');
    }
});
//# sourceMappingURL=index.js.map
