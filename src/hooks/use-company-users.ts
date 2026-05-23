
'use client';

import { useMemo, useCallback, useState } from 'react';
import { collection, query, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/client';
import { useFirebase } from '@/firebase/provider';
import { useCollection as useFirestoreCollection } from '@/firebase/firestore/use-collection';
import type { UserProfile } from '@/lib/types';

type WithId<T> = T & { id: string };

export function useCompanyUsers(companyId?: string | null) {
  const { userProfile } = useFirebase();
  const targetCompanyId = companyId || userProfile?.companyId;

  // Add a key to force a re-fetch
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const usersQuery = useMemo(() => {
    if (!targetCompanyId) return null;

    // The key is used here to create a new query object on demand
    console.log(`Refreshing users for company ${targetCompanyId}, key: ${refreshKey}`);
    return query(collection(db, 'companies', targetCompanyId, 'members'));
  }, [targetCompanyId, refreshKey]);

  const { data: users, loading, error } = useFirestoreCollection<WithId<UserProfile>>(usersQuery);

  return { users: users ?? [], loading, error, refresh };
}
