
'use client';

import { useMemo, useEffect, useRef } from 'react';
import {
  query,
  where,
  QueryConstraint,
  DocumentData,
} from 'firebase/firestore';
import { useFirebase } from '@/firebase/provider';
import { useCollection as useFirestoreCollection } from '@/firebase/firestore/use-collection';
import { companyCollection } from '@/lib/firestore-path';

type WithId<T> = T & { id: string };

export function useCompanyCollection<T = DocumentData>(
  path: string,
  ...constraints: QueryConstraint[]
) {
  const {
    companyId,
    sessionReady,
    firestore,
    isDeveloper,
    needsOnboarding,
  } = useFirebase();

  // --- DEV-only warning for unstable constraints ---
  const prevConstraintsRef = useRef<QueryConstraint[] | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const prev = prevConstraintsRef.current;
    if (prev) {
      const changed =
        prev.length !== constraints.length ||
        prev.some((c, i) => c !== constraints[i]);

      if (changed) {
        console.warn(
          `[useCompanyCollection] Query constraints changed between renders. ` +
            `This can cause a re-subscription to Firestore. Memoize constraints with useMemo(). ` +
            `Path: "${path}"`
        );
      }
    }

    // Store current constraints references for next render comparison
    prevConstraintsRef.current = constraints;
  });


  // Derive this locally to prevent provider bugs from causing infinite loading
  const missingCompanyScope =
    !!sessionReady && !isDeveloper && !needsOnboarding && !companyId;

  const invalidPath =
    !!sessionReady && !!companyId && (!path || path.trim() === '');

  const memoizedQuery = useMemo(() => {
    // Still initializing auth / firestore
    if (!sessionReady || !firestore) return null;

    // Hard blocks that will never become "ready" without user action
    if (isDeveloper) return null;
    if (needsOnboarding) return null;
    if (missingCompanyScope) return null;
    if (invalidPath) return null;

    const collectionRef = companyCollection(firestore, companyId!, path);
    return query(collectionRef, ...constraints);
  }, [
    sessionReady,
    firestore,
    companyId,
    path,
    isDeveloper,
    needsOnboarding,
    missingCompanyScope,
    invalidPath,
    ...constraints,
  ]);

  const { data, loading, error } = useFirestoreCollection<WithId<T>>(memoizedQuery);

  // --- Correct semantics ---

  // 1) Not ready yet: real loading
  if (!sessionReady || !firestore) {
    return { data: [], loading: true, error: null as Error | null };
  }

  // 2) Developer accounts often have no company scope: do NOT spin forever
  if (isDeveloper) {
    return {
      data: [],
      loading: false,
      error: new Error(
        'DEVELOPER_CONTEXT: This page requires a company-scoped account. Switch to an admin/member account or open the developer dashboard.'
      ),
    };
  }

  // 3) Onboarding incomplete: do NOT spin forever
  if (needsOnboarding) {
    return {
      data: [],
      loading: false,
      error: new Error(
        'NEEDS_ONBOARDING: Complete onboarding to access company data.'
      ),
    };
  }

  // 4) Session ready but companyId missing: the real bug you described
  if (missingCompanyScope) {
    return {
      data: [],
      loading: false,
      error: new Error(
        'MISSING_COMPANY_SCOPE: Your auth token has no companyId claim. Log out/in or refresh claims; if this persists, contact support/admin.'
      ),
    };
  }

  // 5) Invalid path is a real developer error: do NOT spin forever
  if (invalidPath) {
    return {
      data: [],
      loading: false,
      error: new Error(
        'INVALID_COLLECTION_PATH: useCompanyCollection() was called with an empty path.'
      ),
    };
  }

  // 6) If memoizedQuery is still null for any other reason, do not spin forever
  if (!memoizedQuery) {
    return {
      data: [],
      loading: false,
      error: new Error('QUERY_BLOCKED: Company query could not be constructed.'),
    };
  }

  // 7) Normal path
  return { data: data ?? [], loading, error: error ?? null };
}
