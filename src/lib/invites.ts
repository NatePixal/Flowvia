'use client';

import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { companyCollection, withCompanyId } from "./firestore-path";
import { db } from "@/firebase/client"; // Use the client instance for consistency

export async function createInvite(
  companyId: string,
  data: {
    name: string;
    phone: string;
    email: string;
    role: string;
  }
): Promise<string> {
  try {
    const invitesRef = companyCollection(db, companyId, "invites");

    const docRef = await addDoc(
      invitesRef,
      withCompanyId(companyId, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        role: data.role,
        status: "pending",
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      })
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating invite:", error);
    throw new Error("Could not create invitation.");
  }
}
