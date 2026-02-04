// functions/src/exports/builders/product.ts
import * as admin from 'firebase-admin';
import { StatementRow, StatementSummary, Currency } from '../types';

const db = admin.firestore();

function toDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function buildProductMovementStatement(params: {
  companyId: string;
  productId: string; // This is the productCode
  from: Date;
  to: Date;
  baseCurrency: Currency;
}): Promise<{ summary: StatementSummary; rows: StatementRow[] }> {
  const { companyId, productId, from, to } = params;

  const productRef = db.doc(`companies/${companyId}/products/${productId}`);
  const productSnap = await productRef.get();
  const productName = (productSnap.data() as any)?.name || productId;

  const incomingRef = db.collection(`companies/${companyId}/incomingProducts`);
  const salesRef = db.collection(`companies/${companyId}/sales`);

  const fromTs = admin.firestore.Timestamp.fromDate(from);
  const toTs = admin.firestore.Timestamp.fromDate(to);

  // Get all relevant movements
  const incomingQuery = incomingRef.where('productCode', '==', productId);
  const salesQuery = salesRef.where('productId', '==', productId);
  
  const [incomingSnap, salesSnap] = await Promise.all([
    incomingQuery.get(),
    salesQuery.get(),
  ]);

  const allMovements = [
    ...incomingSnap.docs.map(d => ({ type: 'IN', doc: d.data(), id: d.id, date: toDate(d.data().businessDate ?? d.data().incomeDate ?? d.data().date) })),
    ...salesSnap.docs.map(d => ({ type: 'OUT', doc: d.data(), id: d.id, date: toDate(d.data().businessDate ?? d.data().date) })),
  ].filter(m => m.date && m.date >= from && m.date <= to)
   .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  // Opening Qty calculation
  const beforeIncomingSnap = await incomingQuery.where('businessDate', '<', fromTs).get();
  const beforeSalesSnap = await salesQuery.where('businessDate', '<', fromTs).get();
  
  let openingQty = 0;
  beforeIncomingSnap.forEach(d => { openingQty += Number(d.data().quantity ?? 0); });
  beforeSalesSnap.forEach(d => { openingQty -= Number(d.data().quantity ?? 0); });

  let runningQty = openingQty;
  const rows: StatementRow[] = [];

  for (const movement of allMovements) {
    let qtyIn = 0;
    let qtyOut = 0;
    let description = '';

    if (movement.type === 'IN') {
      qtyIn = Number(movement.doc.quantity ?? 0);
      description = `Incoming from ${movement.doc.supplier || 'N/A'}`;
    } else { // OUT
      qtyOut = Number(movement.doc.quantity ?? 0);
      description = `Sale to ${movement.doc.clientName || 'N/A'}`;
    }

    runningQty = runningQty + qtyIn - qtyOut;

    // This is a quantity statement, not financial. Debit/Credit represent quantity.
    rows.push({
      businessDate: movement.date!,
      description: description,
      reference: movement.id,
      type: movement.type === 'IN' ? 'Incoming' : 'Sale',
      currency: 'QTY',
      debitOrig: qtyIn,
      creditOrig: qtyOut,
      debitBase: qtyIn,
      creditBase: qtyOut,
      runningBase: runningQty,
    });
  }

  const summary: StatementSummary = {
    title: 'Product Movement Statement',
    companyId,
    periodFrom: from,
    periodTo: to,
    entityLabel: `Product: ${productName} (${productId})`,
    baseCurrency: 'QTY' as Currency,
    openingBase: openingQty,
    totalDebitBase: rows.reduce((s, r) => s + r.debitBase, 0),
    totalCreditBase: rows.reduce((s, r) => s + r.creditBase, 0),
    closingBase: runningQty,
    txCount: rows.length,
    warnings: [],
    totalsByCurrencyOrig: { 'QTY': { debit: rows.reduce((s, r) => s + r.debitOrig, 0), credit: rows.reduce((s, r) => s + r.creditOrig, 0) } },
  };

  return { summary, rows };
}
