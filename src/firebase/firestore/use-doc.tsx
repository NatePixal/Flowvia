'use client';

import { useState, useEffect } from 'react';
import {
  DocumentReference,
  onSnapshot,
  DocumentData,
  FirestoreError,
  DocumentSnapshot,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useFirebase } from '@/firebase/provider'; // Get session readiness from the provider

/** Utility type to add an 'id' field to a given type T. */
type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useDoc hook.
 * @template T Type of the document data.
 */
export interface UseDocResult<T> {
  data: WithId<T> | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a single Firestore document in real-time.
 * This hook requires Firestore security rules to allow 'get' operations on the document path for the authenticated user.
 *
 * IMPORTANT! The provided docRef MUST be memoized (e.g., with useMemo) to prevent infinite re-renders.
 *
 * @template T Optional type for document data. Defaults to any.
 * @param {DocumentReference<DocumentData> | null | undefined} memoizedDocRef -
 * The memoized Firestore DocumentReference. Waits if null/undefined.
 * @returns {UseDocResult<T>} Object with data, isLoading, and error.
 */
export function useDoc<T = any>(
  memoizedDocRef: DocumentReference<DocumentData> | null | undefined,
): UseDocResult<T> {
  type StateDataType = WithId<T> | null;
  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  const { sessionReady } = useFirebase();

  // Stable key: changes only when docRef target changes from null -> real (or to another doc)
  const refPath = memoizedDocRef?.path ?? null;

  useEffect(() => {
    // Gate until auth/profile is ready
    if (!sessionReady) {
      setIsLoading(true);
      setData(null);
      setError(null);
      return;
    }

    // If we don't yet have a ref (e.g., companyId not ready), keep waiting.
    // IMPORTANT: this prevents showing "not found" while the app is still resolving.
    if (!memoizedDocRef) {
      setIsLoading(true);
      setData(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedDocRef,
      (snapshot: DocumentSnapshot<DocumentData>) => {
        if (snapshot.exists()) {
          setData({ ...(snapshot.data() as T), id: snapshot.id });
        } else {
          setData(null);
        }
        setError(null);
        setIsLoading(false);
      },
      (err: FirestoreError) => {
        console.error(`useDoc Error on path ${memoizedDocRef.path}: ${err.code}`, err);
        setError(err);
        setData(null);
        setIsLoading(false);

        // Only emit a specialized permission error for 'permission-denied' codes.
        if (err.code === 'permission-denied') {
            const permissionError = new FirestorePermissionError({
              path: memoizedDocRef.path,
              operation: 'get'
            });
            errorEmitter.emit('permission-error', permissionError);
        }
      }
    );

    return () => unsubscribe();
  }, [sessionReady, refPath]); // ✅ THIS is the core fix

  return { data, isLoading, error };
}
