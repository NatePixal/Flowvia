'use client';

import { collection, doc, Firestore } from 'firebase/firestore';

/**
 * [TEMP DEBUG HELPER]
 * Warns if a path appears to be a root collection path instead of a sub-collection path.
 * This helps catch legacy code patterns during development.
 * @param path - The collection or document path segment to check.
 */
function assertCompanyScopedPath(path: string) {
  // Only warn in dev
  if (process.env.NODE_ENV !== 'development') return;

  // This helper expects a subpath like "sales" or "products/123".
  // Warn only if someone mistakenly passes a FULL root path.
  if (path.startsWith('companies/') || path.startsWith('/companies/')) {
    console.warn(
      `[Firestore Path Helper] Invalid company subpath: "${path}". ` +
      `Pass only the subpath like "sales" or "products/prod123" (not "companies/{id}/...").`
    );
  }

  // Also catch obvious misuse like absolute paths
  if (path.startsWith('/')) {
    console.warn(
      `[Firestore Path Helper] Suspicious absolute path: "${path}". ` +
      `Pass a relative subpath like "sales".`
    );
  }
}


/**
 * Creates a Firestore CollectionReference for a path within a specific company.
 * Ensures that all data access is properly scoped.
 * @param firestore - The Firestore instance.
 * @param companyId - The ID of the company.
 * @param path - The path to the collection (e.g., 'products').
 * @returns A CollectionReference to the specified sub-collection.
 */
export function companyCollection(firestore: Firestore, companyId: string, path: string) {
  assertCompanyScopedPath(path);
  return collection(firestore, `companies/${companyId}/${path}`);
}

/**
 * Creates a Firestore DocumentReference for a path within a specific company.
 * Ensures that all data access is properly scoped.
 * @param firestore - The Firestore instance.
 * @param companyId - The ID of the company.
 * @param path - The path to the document (e.g., 'products/prod123').
 * @returns A DocumentReference to the specified document.
 */
export function companyDoc(firestore: Firestore, companyId: string, path: string) {
  assertCompanyScopedPath(path);
  return doc(firestore, `companies/${companyId}/${path}`);
}

/**
 * A small helper to attach the companyId to a data object before writing to Firestore,
 * ensuring compliance with security rules.
 * @param companyId - The ID of the company.
 * @param data - The data object to which the companyId should be added.
 * @returns The data object augmented with the companyId.
 */
export function withCompanyId<T>(companyId: string, data: T): T & { companyId: string } {
    return {
        ...data,
        companyId: companyId,
    };
}
