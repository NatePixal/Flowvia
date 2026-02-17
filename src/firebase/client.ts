'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth } from "firebase/auth";

// HARD-CODED Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAf0thbzr2dLKC1SJAfGva2Y41b-x5RUHA",
  authDomain: "studio-4893275348-979ce.firebaseapp.com",
  projectId: "studio-4893275348-979ce",
  storageBucket: "studio-4893275348-979ce.appspot.com",
  messagingSenderId: "556935982656",
  appId: "1:556935982656:web:49b62cb18308d3180979a5"
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
