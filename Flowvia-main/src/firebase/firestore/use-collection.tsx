'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, Query, DocumentData, Unsubscribe, FirestoreError } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirebase } from '@/firebase/provider';

/**
 * React hook to subscribe to a Firestore collection in real-time.
 * This hook requires Firestore security rules to allow 'list' operations on the queried path for the authenticated user.
 *
 * @template T Type of the document data in the collection.
 * @param {Query<DocumentData> | null} q The Firestore Query object. The hook will wait if the query is null.
 * @returns An object containing the collection data, loading state, and any potential error.
 */
export function useCollection<T = DocumentData>(q: Query<DocumentData> | null) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | null>(null);
  const { sessionReady } = useFirebase(); // Get session readiness from the provider

  useEffect(() => {
    // Query Readiness Gate: If the query is not ready, do nothing.
    if (!q) {
      setData(null);
      setLoading(true);
      setError(null);
      return;
    }

    // Auth Readiness Gate: Wait until the entire session (auth, claims, profile) is ready.
    if (!sessionReady) {
        setLoading(true);
        setData(null);
        setError(null);
        return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe: Unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as T));
        setData(docs);
        setLoading(false);
      },
      (err) => {
        console.error('[useCollection] Firestore error:', err);
        setError(err);
        setLoading(false);
        
        // Only emit a specialized permission error for 'permission-denied' codes.
        if (err.code === 'permission-denied') {
            const path = (q as any)._query.path.segments.join('/');
            const permissionError = new FirestorePermissionError({
              path: path,
              operation: 'list'
            });
            errorEmitter.emit('permission-error', permissionError);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [q, sessionReady]); // Re-run whenever the query or session readiness changes.

  return { data, loading, error };
}
