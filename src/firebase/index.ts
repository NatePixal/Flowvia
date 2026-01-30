
'use client';

// This file now serves as a central barrel file for exporting all public-facing
// Firebase hooks and utilities, without handling initialization itself.

export * from './client'; // Export app, db, auth from our new single source of truth
export { FirebaseProvider, useFirebase } from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
