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
  productId: string;     // ✅ product document id from UI
  from: Date;
  to: Date;
  baseCurrency: Currency;
}): Promise<{ summary: StatementSummary; rows: StatementRow[] }> {
  const { companyId, productId, from, to } = params;

  const productRef = db.doc(`companies/${companyId}/products/${productId}`);
  const productSnap = await productRef.get();
  const productData = (productSnap.data() as any) || {};
  const productName = productData?.name || productId;

  // ✅ The correct code to match incomingProducts
  const productCode = productData?.productCode || productId;

  const incomingRef = db.collection(`companies/${companyId}/incomingProducts`);
  const salesRef = db.collection(`companies/${companyId}/sales`);

  const fromTs = admin.firestore.Timestamp.fromDate(from);
  const toTs = admin.firestore.Timestamp.fromDate(to);

  // ✅ Use businessDate if present, otherwise fallback to incomeDate/date for older data
  // (This avoids “0 docs” when some docs were created before businessDate existed)
  const incomingQueryBase = incomingRef.where('productCode', '==', productCode);
  const salesQueryBase = salesRef.where('productId', '==', productId);

  const incomingHasBusinessDate = await incomingQueryBase.orderBy('businessDate', 'asc').limit(1).get().then(s => !s.empty).catch(() => false);
  const salesHasBusinessDate = await salesQueryBase.orderBy('businessDate', 'asc').limit(1).get().then(s => !s.empty).catch(() => false);

  const incomingDateField = incomingHasBusinessDate ? 'businessDate' : 'incomeDate';
  const salesDateField = salesHasBusinessDate ? 'businessDate' : 'date';

  // Range movements
  const [incomingSnap, salesSnap] = await Promise.all([
    incomingQueryBase
      .where(incomingDateField, '>=', fromTs)
      .where(incomingDateField, '<=', toTs)
      .orderBy(incomingDateField, 'asc')
      .get(),
    salesQueryBase
      .where(salesDateField, '>=', fromTs)
      .where(salesDateField, '<=', toTs)
      .orderBy(salesDateField, 'asc')
      .get(),
  ]);

  const movements = [
    ...incomingSnap.docs.map(d => ({
      type: 'IN' as const,
      id: d.id,
      doc: d.data(),
      date: toDate(d.data()[incomingDateField]) ?? toDate(d.data().createdAt),
    })),
    ...salesSnap.docs.map(d => ({
      type: 'OUT' as const,
      id: d.id,
      doc: d.data(),
      date: toDate(d.data()[salesDateField]) ?? toDate(d.data().createdAt),
    })),
  ]
    .filter(m => m.date && m.date >= from && m.date <= to)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());

  // Opening quantity
  const [beforeIncomingSnap, beforeSalesSnap] = await Promise.all([
    incomingQueryBase.where(incomingDateField, '<', fromTs).get(),
    salesQueryBase.where(salesDateField, '<', fromTs).get(),
  ]);

  let openingQty = 0;
  beforeIncomingSnap.forEach(d => { openingQty += Number(d.data().quantity ?? 0); });
  beforeSalesSnap.forEach(d => { openingQty -= Number(d.data().quantity ?? 0); });

  let runningQty = openingQty;
  const rows: StatementRow[] = [];

  for (const m of movements) {
    const qty = Number(m.doc.quantity ?? 0);
    const qtyIn = m.type === 'IN' ? qty : 0;
    const qtyOut = m.type === 'OUT' ? qty : 0;

    runningQty = runningQty + qtyIn - qtyOut;

    rows.push({
      businessDate: m.date!,
      description: m.type === 'IN'
        ? `Incoming from ${m.doc.supplier || 'N/A'}`
        : `Sale to ${m.doc.clientName || 'N/A'}`,
      reference: m.id,
      type: m.type === 'IN' ? 'Incoming' : 'Sale',
      currency: 'QTY',
      debitOrig: qtyIn,
      creditOrig: qtyOut,
      debitBase: qtyIn,
      creditBase: qtyOut,
      runningBase: runningQty,
    });
  }

  const summary: StatementSummary = {
    title: 'Inventory Movement Statement',
    companyId,
    periodFrom: from,
    periodTo: to,
    entityLabel: `Product: ${productName} (${productCode})`,
    baseCurrency: 'QTY',
    openingBase: openingQty,
    totalDebitBase: rows.reduce((s, r) => s + (r.debitBase || 0), 0),
    totalCreditBase: rows.reduce((s, r) => s + (r.creditBase || 0), 0),
    closingBase: runningQty,
    txCount: rows.length,
    warnings: [],
    totalsByCurrencyOrig: {
      QTY: {
        debit: rows.reduce((s, r) => s + (r.debitOrig || 0), 0),
        credit: rows.reduce((s, r) => s + (r.creditOrig || 0), 0),
      },
    },
  };

  return { summary, rows };
}
