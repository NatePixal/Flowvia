'use client';
import {
  doc,
  getDocs,
  collection,
  runTransaction,
  query,
  orderBy,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { clampNonNegative, toMinor } from './money';
import { ClientLedgerEntry, Supplier, SupplierLedgerEntry, Client, Currency } from './types';
import { withCompanyId } from './firestore-path';

export async function recomputeClientOutstanding(db: any, companyId: string, clientId: string) {
  const clientRef = doc(db, 'companies', companyId, 'clients', clientId);
  const ledgerRef = collection(db, 'companies', companyId, 'clients', clientId, 'ledger');

  const ledgerSnap = await getDocs(query(ledgerRef));

  const balanceByCurrency: { [key in Currency]?: number } = {};

  ledgerSnap.forEach(doc => {
    const entry = doc.data() as ClientLedgerEntry;
    const currency = entry.currency;
    if (!currency) return;

    if (balanceByCurrency[currency] === undefined) {
      balanceByCurrency[currency] = 0;
    }

    if (entry.type === 'purchase') {
      balanceByCurrency[currency]! += (entry.totalMinor ?? 0);
    } else if (entry.type === 'payment') {
      balanceByCurrency[currency]! -= (entry.paymentMinor ?? 0);
    }
  });

  // Note: openPurchasesCount is not updated here to keep the change minimal,
  // as the primary goal is to fix the balance calculation. The old logic for it was tied
  // to summing positive due amounts, which is what's being corrected.
  await updateDoc(clientRef, {
    companyId,
    outstandingByCurrency: balanceByCurrency,
    lastActivityAt: serverTimestamp(),
  });
}


export async function recomputeSupplierBalance(db: any, companyId: string, supplierId: string) {
  const supplierRef = doc(db, 'companies', companyId, 'suppliers', supplierId);
  const ledgerRef = collection(db, 'companies', companyId, 'suppliers', supplierId, 'ledger');

  const ledgerSnap = await getDocs(query(ledgerRef, where('type', '==', 'purchase')));
  const allPurchases = ledgerSnap.docs.map(d => d.data() as SupplierLedgerEntry);

  const balances: Record<string, number> = {};
  let nextDue: Timestamp | null = null;
  let overdueCount = 0;
  const now = new Date();

  for (const entry of allPurchases) {
    const due =
      entry.purchaseDueMinor ??
      clampNonNegative((entry.purchaseTotalMinor ?? 0) - (entry.purchasePaidMinor ?? 0));

    if (due <= 0) continue;

    if (entry.currency) {
      balances[entry.currency] = (balances[entry.currency] || 0) + due;
    }

    if (entry.dueDate) {
      const dueDate = (entry.dueDate as Timestamp).toDate();

      if (dueDate >= now && (!nextDue || dueDate < nextDue.toDate())) {
        nextDue = entry.dueDate as Timestamp;
      }
      if (dueDate < now) overdueCount++;
    }
  }

  await updateDoc(supplierRef, {
    balanceDueByCurrency: balances,
    nextDueDate: nextDue,
    overdueCount,
    lastActivityAt: serverTimestamp(),
  });
}

export async function recordClientPaymentFIFO(
  db: any,
  companyId: string,
  clientId: string,
  paymentMinor: number,
  currency: Currency,
  note?: string
) {
  const clientRef = doc(db, 'companies', companyId, 'clients', clientId);
  const ledgerRef = collection(db, 'companies', companyId, 'clients', clientId, 'ledger');

  // 1) Get ordered purchase doc refs (outside tx is fine for listing)
  const purchasesSnap = await getDocs(
    query(
      ledgerRef,
      where('type', '==', 'purchase'),
      where('currency', '==', currency),
      orderBy('createdAt', 'asc')
    )
  );
  const purchaseRefs = purchasesSnap.docs.map((d) => d.ref);

  // 2) Transaction: read each doc via tx.get, update FIFO, and add payment entry
  await runTransaction(db, async (tx: any) => {
    let remainingPayment = paymentMinor;

    for (const ref of purchaseRefs) {
      if (remainingPayment <= 0) break;

      const snap = await tx.get(ref);
      if (!snap.exists()) continue;

      const purchase = snap.data() as ClientLedgerEntry;
      const dueMinor = purchase.dueMinor ?? clampNonNegative((purchase.totalMinor ?? 0) - (purchase.paidMinor ?? 0));

      if (dueMinor <= 0) continue;
      
      const amountToApply = Math.min(remainingPayment, dueMinor);
      
      tx.update(ref, {
        paidMinor: (purchase.paidMinor ?? 0) + amountToApply,
        dueMinor: dueMinor - amountToApply,
      });

      remainingPayment -= amountToApply;
    }

    const paymentEntry: Omit<ClientLedgerEntry, 'id'> = withCompanyId(companyId, {
      clientId,
      type: 'payment',
      currency,
      totalMinor: paymentMinor,
      paidMinor: paymentMinor,
      dueMinor: 0,
      paymentMinor: paymentMinor,
      note: note || 'Client Payment',
      createdAt: serverTimestamp(),
    });
    tx.set(doc(ledgerRef), paymentEntry);

    tx.update(clientRef, { companyId, lastActivityAt: serverTimestamp() });
  });

  // 3) Recompute balance AFTER the transaction has committed
  await recomputeClientOutstanding(db, companyId, clientId);
}

export async function recordSupplierPaymentFIFO(
  db: any,
  companyId: string,
  supplierId: string,
  paymentMinor: number,
  currency: Currency,
  note?: string
) {
  const ledgerRef = collection(db, 'companies', companyId, 'suppliers', supplierId, 'ledger');

  // 1) Read purchases OUTSIDE the transaction to get stable doc refs (ordering still works)
  const purchasesSnap = await getDocs(query(
    ledgerRef,
    where('type', '==', 'purchase'),
    where('currency', '==', currency),
    orderBy('createdAt', 'asc')
  ));

  const purchaseRefs = purchasesSnap.docs.map(d => d.ref);

  // 2) Transaction: apply FIFO + create payment entry (NO recompute here)
  await runTransaction(db, async (transaction: any) => {
    let remainingPayment = paymentMinor;

    for (const ref of purchaseRefs) {
      if (remainingPayment <= 0) break;

      const snap = await transaction.get(ref);
      if (!snap.exists()) continue;

      const purchase = snap.data() as SupplierLedgerEntry;

      // IMPORTANT: compute due even if purchaseDueMinor is missing
      const dueMinor =
        purchase.purchaseDueMinor ??
        clampNonNegative((purchase.purchaseTotalMinor ?? 0) - (purchase.purchasePaidMinor ?? 0));

      if (dueMinor <= 0) continue;

      const amountToApply = Math.min(remainingPayment, dueMinor);

      const newPaidMinor = (purchase.purchasePaidMinor ?? 0) + amountToApply;
      const newDueMinor = dueMinor - amountToApply;

      transaction.update(ref, {
        purchasePaidMinor: newPaidMinor,
        purchaseDueMinor: newDueMinor,
      });

      remainingPayment -= amountToApply;
    }

    const paymentEntry: Omit<SupplierLedgerEntry, 'id'> = withCompanyId(companyId, {
      supplierId,
      type: 'payment',
      currency,
      paymentMinor,
      note: note || 'Payment to supplier',
      createdAt: serverTimestamp(),
    });

    transaction.set(doc(ledgerRef), paymentEntry);
  });

  // 3) Recompute AFTER commit so reads see the updated purchaseDueMinor values
  await recomputeSupplierBalance(db, companyId, supplierId);
}
