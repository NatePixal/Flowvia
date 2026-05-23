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
  systemAdmin?: boolean;
  [key: string]: any;
}

interface AuthContextType {
  user: User | null;
  userProfile: (UserProfile & { id: string; role: UserRole }) | null;
  company: (Company & { id: string }) | null;
  companyBaseCurrency: Currency | null;
  isUserLoading: boolean;
  authResolved: boolean;
  sessionReady: boolean;
  companyId: string | null;
  role: UserRole | null;
  isDeveloper: boolean;
  isSystemAdmin: boolean;
  isCompanyMember: boolean;
  isBlocked: boolean;
  needsOnboarding: boolean;
  missingCompanyScope: boolean;
  missingCompanyMembership: boolean;
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
  const [company, setCompany] = useState<(Company & { id: string }) | null>(null);
  const [claims, setClaims] = useState<CustomClaims | null>(null);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);

  const [isUserLoading, setIsUserLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);
  const [profileResolved, setProfileResolved] = useState(false);
  const [claimsResolved, setClaimsResolved] = useState(false);
  
  const [isBlocked, setIsBlocked] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [missingCompanyMembership, setMissingCompanyMembership] = useState(false);
  
  const didAttemptRepair = useRef(false);

  const fetchUserContext = useCallback(
    async (firebaseUser: User | null) => {
      console.log(`AUTH uid=${firebaseUser?.uid || null}`);
      setProfileResolved(false);
      setClaimsResolved(false);
      setCompany(null);
      setIsSystemAdmin(false);
      setMissingCompanyMembership(false);

      if (!firebaseUser) {
        setUser(null);
        setUserProfile(null);
        setClaims(null);
        setIsSystemAdmin(false);
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

      const [tokenRes, profileSnap, systemAdminSnap] = await Promise.all([
        firebaseUser.getIdTokenResult(),
        getDoc(doc(firestoreInstance, 'users', firebaseUser.uid)),
        getDoc(doc(firestoreInstance, 'systemAdmins', firebaseUser.uid)).catch((error) => {
          console.info('SYSTEM_ADMIN_LOOKUP unavailable:', error?.code || error?.message || error);
          return null;
        }),
      ]);

      const hasSystemAdminRecord = systemAdminSnap?.exists() === true;
      setIsSystemAdmin(hasSystemAdminRecord);
      const profile = profileSnap.exists() ? (profileSnap.data() as any) : null;
      const docCompanyId = profile?.companyId ?? null;
      const docRole = profile?.role ?? null;
      console.log(`PROFILE exists=${profileSnap.exists()} companyId=${docCompanyId}`);

      let claims = (tokenRes.claims ?? {}) as any;
      let role = (hasSystemAdminRecord ? 'developer' : (claims.role ?? docRole ?? null)) as UserRole | null;
      let claimCompanyId = claims.companyId ?? null;
      console.log(`TOKEN0 role=${claims.role} companyId=${claims.companyId}`);

      if ((hasSystemAdminRecord || (!claimCompanyId && docCompanyId)) && !didAttemptRepair.current) {
        didAttemptRepair.current = true;
        try {
          const functions = getFunctions(firebaseApp, 'us-central1');
          const repair = httpsCallable(functions, 'repairMyClaims');
          await repair({});
          await firebaseUser.getIdToken(true);
          const refreshed = await firebaseUser.getIdTokenResult();
          claims = (refreshed.claims ?? {}) as any;
          role = (hasSystemAdminRecord ? 'developer' : (claims.role ?? docRole ?? null)) as UserRole | null;
          claimCompanyId = claims.companyId ?? null;
          console.log(`TOKEN1 role=${claims.role} companyId=${claims.companyId}`);
        } catch (e) {
          console.error("CLAIMS_REPAIR failed:", e);
        }
      }

      setClaims(claims);

      const resolvedCompanyId = hasSystemAdminRecord ? null : (claimCompanyId || docCompanyId);
      let effectiveProfile = profile;
      let effectiveRole = role;

      if (resolvedCompanyId) {
        try {
          const memberSnap = await getDoc(doc(firestoreInstance, 'companies', resolvedCompanyId, 'members', firebaseUser.uid));
          if (!memberSnap.exists()) {
            setMissingCompanyMembership(true);
          } else {
            const member = memberSnap.data() as any;
            if (member.status !== 'active') {
              setMissingCompanyMembership(true);
              setIsBlocked(member.status === 'blocked');
            } else {
              effectiveRole = member.role ?? effectiveRole;
              effectiveProfile = {
                ...(profile || {}),
                companyId: resolvedCompanyId,
                role: effectiveRole,
                status: member.status,
              };
              const companySnap = await getDoc(doc(firestoreInstance, 'companies', resolvedCompanyId));
              if (companySnap.exists()) {
                setCompany({ id: companySnap.id, ...(companySnap.data() as Company) });
              }
            }
          }
        } catch (error: any) {
          console.error('COMPANY_CONTEXT failed:', error?.code || error?.message || error);
          setMissingCompanyMembership(true);
        }
      }

      const isActuallyOnboarding = !profileSnap.exists();
      if (hasSystemAdminRecord) {
        const systemAdmin = systemAdminSnap?.data() as any;
        setUserProfile({
          id: profileSnap.exists() ? profileSnap.id : firebaseUser.uid,
          uid: firebaseUser.uid,
          email: firebaseUser.email || systemAdmin?.email || '',
          name: profile?.name || systemAdmin?.name || firebaseUser.displayName || firebaseUser.email || 'System admin',
          isPaid: true,
          createdAt: profile?.createdAt || systemAdmin?.createdAt || new Date() as any,
          ...profile,
          // These must come AFTER the spread so they are never overwritten by raw profile data
          companyId: '',
          status: systemAdmin?.status === 'blocked' ? 'blocked' : 'active',
          role: 'developer',
        });
        setIsBlocked(systemAdmin?.status === 'blocked');
        setNeedsOnboarding(false);
      } else if (profileSnap.exists()) {
        setUserProfile({ id: profileSnap.id, ...effectiveProfile, role: effectiveRole || profile.role });
        setIsBlocked(effectiveProfile?.status === 'blocked');
        setNeedsOnboarding(isActuallyOnboarding);
      } else {
        setUserProfile(null);
        setIsBlocked(false);
        setNeedsOnboarding(isActuallyOnboarding);
      }
      
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
  
  const companyId = isSystemAdmin ? null : ((claims?.companyId as string | undefined) ?? userProfile?.companyId ?? null);
  const role = (isSystemAdmin ? 'developer' : ((claims?.role as UserRole | undefined) ?? userProfile?.role ?? null)) as UserRole | null;
  const companyBaseCurrency = company?.baseCurrency ?? null;
  const isDeveloper = isSystemAdmin;
  const isCompanyMember = !!companyId && !isSystemAdmin && !missingCompanyMembership;

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
    !isSystemAdmin &&
    !needsOnboarding &&
    !companyId;
  
  console.log(`FINAL companyId=${companyId} baseCurrency=${companyBaseCurrency} sessionReady=${sessionReady} missingCompanyScope=${finalMissingCompanyScope}`);

  const value = useMemo(
    () => ({
      user,
      userProfile,
      company,
      companyBaseCurrency,
      isUserLoading,
      authResolved,
      sessionReady,
      companyId,
      role,
      isCompanyMember,
      isDeveloper,
      isSystemAdmin,
      isBlocked,
      needsOnboarding,
      missingCompanyScope: finalMissingCompanyScope,
      missingCompanyMembership,
      refreshUserProfile,
      auth: authInstance,
      firestore: firestoreInstance,
      firebaseApp,
    }),
    [
      user, userProfile, company, companyBaseCurrency, isUserLoading, authResolved, sessionReady, companyId, role,
      isCompanyMember, isDeveloper, isSystemAdmin, isBlocked, needsOnboarding, finalMissingCompanyScope, missingCompanyMembership,
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
