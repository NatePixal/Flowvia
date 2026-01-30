/**
 * Firestore Rules Test Script
 * Run this in Node.js with Firebase Admin SDK installed
 * Command: node firestore-rules-test.js
 */

const admin = require('firebase-admin');

// Initialize your project
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// Define test users
const users = [
  { uid: 'devUser', role: 'developer', companyId: 'company1' },
  { uid: 'adminUser', role: 'admin', companyId: 'company1' },
  { uid: 'managerUser', role: 'manager', companyId: 'company1' },
  { uid: 'salesUser', role: 'sales', companyId: 'company1' },
  { uid: 'accountingUser', role: 'accounting', companyId: 'company1' },
];

// Collections to test
const collections = [
  'users', 'invites', 'companies', 'products', 'sales',
  'clients', 'client_transactions', 'client_payments',
  'client_loans', 'suppliers', 'supplierPayments', 'sellers',
  'employees', 'dailyExpenses', 'incomingProducts', 'inventoryLogs'
];

// Helper function to test read/write
async function testCollection(user, collection) {
  console.log(`\nTesting collection "${collection}" as ${user.role} (${user.uid})`);

  const docRef = db.collection(collection).doc('testDoc');

  try {
    await docRef.get();
    console.log('✅ Read allowed');
  } catch (e) {
    console.log('❌ Read denied');
  }

  try {
    await docRef.set({ test: true, companyId: user.companyId });
    console.log('✅ Write allowed');
  } catch (e) {
    console.log('❌ Write denied');
  }
}

(async () => {
  for (const user of users) {
    for (const collection of collections) {
      await testCollection(user, collection);
    }
  }
  console.log('\nTest completed.');
})();
