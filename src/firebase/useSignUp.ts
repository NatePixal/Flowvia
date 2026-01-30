
'use client';

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useFirebase } from './provider';
import { createUserWithEmailAndPassword } from 'firebase/auth';

interface SignUpParams {
  email: string;
  password: string;
  displayName: string;
  companyName: string;
}

export const useSignUp = () => {
  const { firebaseApp, auth, refreshUserProfile } = useFirebase();
  const [loading, setLoading] = useState(false);

  const signUp = async ({ email, password, displayName, companyName }: SignUpParams) => {
    setLoading(true);
    try {
      // 1) Create user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Ensure token exists for callable auth context
      await user.getIdToken();

      // 2) Call backend to create docs + set claims
      const functions = getFunctions(firebaseApp, 'us-central1');
      const createUserAndCompany = httpsCallable(functions, 'createUserAndCompany');

      const res = await createUserAndCompany({ displayName, companyName });
      const data = res.data as any;

      if (!data?.success) {
        throw new Error(data?.error || 'createUserAndCompany failed');
      }

      // 3) Force refresh token to pull new custom claims
      await user.getIdToken(true);

      // 4) Refresh provider state
      await refreshUserProfile();

      return { success: true, error: null };
    } catch (err: any) {
      console.error('Sign-up process error:', err);

      // Cleanup partially created user
      if (auth.currentUser) {
        try {
          await auth.currentUser.delete();
        } catch (deleteError) {
          console.error('Failed to clean up partially created user:', deleteError);
        }
      }

      return { success: false, error: err?.message || 'toast.error.unexpectedError' };
    } finally {
      setLoading(false);
    }
  };

  return { signUp, loading };
};
