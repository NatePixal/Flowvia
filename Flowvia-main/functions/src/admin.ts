import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Initialize exactly once (safe for deploy analyzer + runtime)
if (!getApps().length) {
  initializeApp();
}

export const db = getFirestore();
export const storage = getStorage();
