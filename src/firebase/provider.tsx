'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth, db } from './client';
import type { UserProfile, UserRole, Company, Currency } from '@/lib/types';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

interface CustomClaims {
  companyId?: string;
  role?: UserRole;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  userProfile: (UserProfile & { id: string; role: UserRole }) | null;
  companyBaseCurrency: Currency | null;
  isUserLoading: boolean;
  authResolved: boolean;
  sessionReady: boolean;
  companyId: string | null;
  role: UserRole | null;
  isDeveloper: boolean;
  isCompanyMember: boolean;
  isBlocked: boolean;
  needsOnboarding: boolean;
  missingCompanyScope: boolean;
  refreshUserProfile: () => Promise<void>;
  auth: Auth;
  firestore: Firestore;
  firebaseApp: FirebaseApp;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({
  children,
  firebaseApp = app,
  auth: authInstance = auth,
  firestore: firestoreInstance = db,
}: {
  children: React.ReactNode;
  firebaseApp?: FirebaseApp;
  auth?: Auth;
  firestore?: Firestore;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<(UserProfile & { id: string; role: UserRole }) | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [claims, setClaims] = useState<CustomClaims | null>(null);

  const [isUserLoading, setIsUserLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [claimsResolved, setClaimsResolved] = useState(false);
  
  const [isBlocked, setIsBlocked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  
  const didAttemptRepair = useRef(false);

  const fetchUserContext = useCallback(
    async (firebaseUser: User | null) => {
      console.log(`AUTH uid=${firebaseUser?.uid || null}`);
      setProfileResolved(false);
      setClaimsResolved(false);
      setCompany(null);

      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setClaims(null);
        setProfileResolved(true);
        setClaimsResolved(true);
        didAttemptRepair.current = false;
        setIsUserLoading(false);
        setAuthResolved(true);
        return;
      }
      
      setIsUserLoading(true);
      setAuthResolved(true);
      setUser(firebaseUser);

      const [tokenRes, profileSnap] = await Promise.all([
        firebaseUser.getIdTokenResult(),
        getDoc(doc(firestoreInstance, 'users', firebaseUser.uid)),
      ]);

      const profile = profileSnap.exists() ? (profileSnap.data() as any) : null;
      const docCompanyId = profile?.companyId ?? null;
      const docRole = profile?.role ?? null;
      console.log(`PROFILE exists=${profileSnap.exists()} companyId=${docCompanyId}`);

      let claims = (tokenRes.claims ?? {}) as any;
      let role = (claims.role ?? docRole ?? null) as UserRole | null;
      let claimCompanyId = claims.companyId ?? null;
      console.log(`TOKEN0 role=${claims.role} companyId=${claims.companyId}`);

      if (role !== 'developer' && !claimCompanyId && docCompanyId && !didAttemptRepair.current) {
        didAttemptRepair.current = true;
        try {
          const functions = getFunctions(firebaseApp, 'us-central1');
          const repair = httpsCallable(functions, 'repairMyClaims');
          await repair({});
          await firebaseUser.getIdToken(true);
          const refreshed = await firebaseUser.getIdTokenResult();
          claims = (refreshed.claims ?? {}) as any;
          role = (claims.role ?? docRole ?? null) as UserRole | null;
          claimCompanyId = claims.companyId ?? null;
          console.log(`TOKEN1 role=${claims.role} companyId=${claims.companyId}`);
        } catch (e) {
          console.error("CLAIMS_REPAIR failed:", e);
        }
      }

      setClaims(claims);

      if (claimCompanyId) {
        const companySnap = await getDoc(doc(firestoreInstance, 'companies', claimCompanyId));
        if (companySnap.exists()) {
          setCompany(companySnap.data() as Company);
        }
      }

      const isActuallyOnboarding = !profileSnap.exists();
      if (profileSnap.exists()) {
        setUserProfile({ id: profileSnap.id, ...profile, role: profile.role });
        setIsBlocked(profile.status === 'blocked');
      } else {
        setUserProfile(null);
        setIsBlocked(false);
      }
      setNeedsOnboarding(isActuallyOnboarding);
      
      setClaimsResolved(true);
      setProfileResolved(true);
      setIsUserLoading(false);
    },
    [firestoreInstance, firebaseApp]
  );
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(authInstance, fetchUserContext);
    return () => unsubscribe();
  }, [authInstance, fetchUserContext]);

  const refreshUserProfile = useCallback(async () => {
    const currentUser = authInstance.currentUser;
    if (currentUser) {
        didAttemptRepair.current = false;
    }
    await fetchUserContext(currentUser);
  }, [authInstance, fetchUserContext]);
  
  // Inactivity timeout effect
  useEffect(() => {
    if (typeof window === 'undefined' || !user) {
      return;
    }

    let activityTimeout: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(activityTimeout);
      activityTimeout = setTimeout(() => {
        signOut(authInstance).catch(error => {
          console.error("Error signing out due to inactivity:", error);
        });
      }, 15 * 60 * 1000); // 15 minutes
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'mousemove',
      'keydown',
      'click',
      'scroll',
      'touchstart',
    ];

    activityEvents.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    resetTimer();

    return () => {
      clearTimeout(activityTimeout);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user, authInstance]);
  
  const companyId = (claims?.companyId as string | undefined) ?? null;
  const role = (claims?.role as UserRole | undefined) ?? null;
  const companyBaseCurrency = company?.baseCurrency ?? null;
  const isDeveloper = role === 'developer';
  const isCompanyMember = !!companyId && !isDeveloper;

  const authReady =
    authResolved &&
    profileResolved &&
    claimsResolved &&
    !isUserLoading;

  // sessionReady should mean "we know the truth now"
  const sessionReady = authReady;

  const finalMissingCompanyScope =
    authReady &&
    !!user &&
    !isDeveloper &&
    !needsOnboarding &&
    !companyId;
  
  console.log(`FINAL companyId=${companyId} baseCurrency=${companyBaseCurrency} sessionReady=${sessionReady} missingCompanyScope=${finalMissingCompanyScope}`);

  const value = useMemo(
    () => ({
      user,
      userProfile,
      companyBaseCurrency,
      isUserLoading,
      authResolved,
      sessionReady,
      companyId,
      role,
      isCompanyMember,
      isDeveloper,
      isBlocked,
      needsOnboarding,
      missingCompanyScope: finalMissingCompanyScope,
      refreshUserProfile,
      auth: authInstance,
      firestore: firestoreInstance,
      firebaseApp,
    }),
    [
      user, userProfile, companyBaseCurrency, isUserLoading, authResolved, sessionReady, companyId, role,
      isCompanyMember, isDeveloper, isBlocked, needsOnboarding, finalMissingCompanyScope,
      refreshUserProfile, authInstance, firestoreInstance, firebaseApp
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useFirebase = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useFirebase must be used inside FirebaseProvider');
  return ctx;
};

export const useFirebaseOptional = (): AuthContextType | undefined => {
  return useContext(AuthContext);
};
