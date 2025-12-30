
'use client';

import React from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { app, auth, db } from '@/firebase/client'; // Import the initialized services

interface FirebaseClientProviderProps {
  children: React.ReactNode;
}

// This component ensures that the main FirebaseProvider receives the
// singleton instances of the Firebase services initialized in client.ts.
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  return (
    <FirebaseProvider
      firebaseApp={app}
      auth={auth}
      firestore={db}
    >
      {children}
    </FirebaseProvider>
  );
}
