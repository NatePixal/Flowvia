'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

// Firebase config using environment variables with the studio config as a fallback
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAf0thbzr2dLKC1SJAfGva2Y41b-x5RUHA",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "studio-4893275348-979ce.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "studio-4893275348-979ce",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "studio-4893275348-979ce.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "556935982656",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:556935982656:web:4a49c95eb1464e710979a5",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-TF0VV51Z3B"
};

// Initialize Firebase only once
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

console.log('[Firebase init] projectId:', app.options?.projectId);

// Exports for use in the app
const db: Firestore = getFirestore(app);
const auth: Auth = getAuth(app);

export { app, db, auth };
