import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Currency, UserRole } from './types';
import { toMinor, convertMinorToBase, convertBaseToMinor } from './money';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// -------------------- Helpers --------------------
function requireAuth(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required.');
  }
  return context.auth;
}

function roleOf(context: functions.https.CallableContext): UserRole {
  return ((context.auth?.token as any)?.role as UserRole) ?? 'sales';
}

function companyIdOf(context: functions.https.CallableContext, data?: any): string {
  const role = roleOf(context);
  const claimCompanyId = ((context.auth?.token as any)?.companyId as string | undefined) ?? undefined;
  const requested = (data?.companyId as string | undefined) ?? undefined;

  if (role === 'developer') {
    const cid = requested || claimCompanyId;
    if (!cid) throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    return cid;
  }
  if (!claimCompanyId) throw new functions.https.HttpsError('failed-precondition', 'No companyId claim on token.');
  if (requested && requested !== claimCompanyId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot access another company.');
  }
  return claimCompanyId;
}

function requireOneOfRoles(context: functions.https.CallableContext, roles: UserRole[]) {
  const r = roleOf(context);
  if (!roles.includes(r)) {
    throw new functions.https.HttpsError('permission-denied', `Requires role in: ${roles.join(', ')}`);
  }
}

function businessDayFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function businessDateFromDay(day: string): admin.firestore.Timestamp {
  return Timestamp.fromDate(new Date(`${day}T00:00:00.000Z`));
}

async function getCompany(companyId: string) {
  const snap = await db.doc(`companies/${companyId}`).get();
  if (!snap.exists) throw new functions.https.HttpsError('failed-precondition', 'Company not found.');
  return snap.data() as any;
}

async function getLocationName(companyId: string, locationId: string): Promise<string> {
  const snap = await db.doc(`companies/${companyId}/locations/${locationId}`).get();
  return (snap.exists ? (snap.data() as any).name : '') || '';
}

function getTelegramToken(): string | null {
  try {
    const cfg = functions.config() as any;
    const token = cfg?.telegram?.token as string | undefined;
    if (token) return token;
  } catch {
    // ignore
  }
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

async function sendTelegramMessage(chatId: string, text: string) {
  const token = getTelegramToken();
  if (!token) return;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch((e) => console.error('Telegram send failed', e));
}

type FxSnapshot = {
  rateToBase: number;
  enteredRate: number;
  enteredPair: string;
  capturedAt: any;
};

type LayerAllocation = { layerId: string; qty: number; unitCostBaseMinor: number };

type SaleItemInput = {
  productId: string; // product doc id
  quantity: number;
  unitPrice: number; // major, in sale currency
};

function assertPositiveInt(v: any, name: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new functions.https.HttpsError('invalid-argument', `${name} must be a positive integer.`);
  }
  return n;
}

function assertNonNegativeNumber(v: any, name: string) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    throw new functions.https.HttpsError('invalid-argument', `${name} must be >= 0.`);
  }
  return n;
}

async function consumeFifoLayers(
  tx: FirebaseFirestore.Transaction,
  layersQuery: FirebaseFirestore.Query,
  qtyNeeded: number
): Promise<{ allocations: LayerAllocation[]; cogsBaseMinor: number }>
{
  const snap = await tx.get(layersQuery);
  let remaining = qtyNeeded;
  const allocations: LayerAllocation[] = [];
  let cogsBaseMinor = 0;

  for (const docSnap of snap.docs) {
    const d = docSnap.data() as any;
    const remainingQty = Number(d.remainingQty ?? 0);
    const unitCostBaseMinor = Number(d.unitCostBaseMinor ?? 0);
    if (remainingQty <= 0) continue;
    const take = Math.min(remaining, remainingQty);
    if (take <= 0) continue;

    allocations.push({ layerId: docSnap.id, qty: take, unitCostBaseMinor });
    cogsBaseMinor += take * unitCostBaseMinor;

    tx.update(docSnap.ref, {
      remainingQty: remainingQty - take,
      updatedAt: FieldValue.serverTimestamp(),
    });

    remaining -= take;
    if (remaining === 0) break;
  }

  if (remaining > 0) {
    throw new functions.https.HttpsError('failed-precondition', 'Not enough FIFO layers to fulfill quantity.');
  }

  return { allocations, cogsBaseMinor };
}

async function restoreFifoLayers(
  tx: FirebaseFirestore.Transaction,
  stockRef: FirebaseFirestore.DocumentReference,
  allocations: LayerAllocation[]
) {
  for (const a of allocations) {
    const layerRef = stockRef.collection('layers').doc(a.layerId);
    const layerSnap = await tx.get(layerRef);
    if (!layerSnap.exists) {
      // If layer is missing, recreate it as a return layer.
      tx.set(layerRef, {
        remainingQty: a.qty,
        unitCostBaseMinor: a.unitCostBaseMinor,
        source: 'return',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      continue;
    }
    const d = layerSnap.data() as any;
    const remainingQty = Number(d.remainingQty ?? 0);
    tx.update(layerRef, {
      remainingQty: remainingQty + a.qty,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

function calcNewAvg(valueBaseMinor: number, qty: number): number {
  if (!Number.isFinite(valueBaseMinor) || !Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(valueBaseMinor / qty);
}

// -------------------- Auth / Claims --------------------

export const createUserAndCompany = functions.region('us-central1').https.onCall(async (data, context) => {
  const auth = requireAuth(context);

  const displayName = String(data?.displayName ?? '').trim();
  const companyName = String(data?.companyName ?? '').trim();
  if (!companyName) throw new functions.https.HttpsError('invalid-argument', 'companyName is required.');

  const uid = auth.uid;
  const companyRef = db.collection('companies').doc();
  const companyId = companyRef.id;
  const profileRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const existingProfile = await tx.get(profileRef);
    if (existingProfile.exists) {
      throw new functions.https.HttpsError('already-exists', 'User profile already exists.');
    }

    tx.set(companyRef, {
      name: companyName,
      ownerId: uid,
      userCount: 1,
      baseCurrency: 'USD',
      warehouseCapacity: 0,
      warehouseCapacityType: 'units',
      locationsEnabled: false,
      posEnabled: true,
      telegramAlertsEnabled: false,
      telegramChatId: '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(profileRef, {
      email: (auth.token.email as string | undefined) ?? '',
      name: displayName || (auth.token.name as string | undefined) || '',
      companyId,
      role: 'admin',
      isPaid: false,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  await admin.auth().setCustomUserClaims(uid, { companyId, role: 'admin' });
  return { success: true, companyId, role: 'admin' };
});

export const repairMyClaims = functions.region('us-central1').https.onCall(async (data, context) => {
  const auth = requireAuth(context);
  const uid = auth.uid;

  const profileSnap = await db.doc(`users/${uid}`).get();
  if (!profileSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'User profile not found.');
  const profile = profileSnap.data() as any;

  const companyId = profile.companyId as string | undefined;
  const role = (profile.role as UserRole | undefined) ?? 'sales';

  if (!companyId && role !== 'developer') {
    throw new functions.https.HttpsError('failed-precondition', 'Profile has no companyId.');
  }

  await admin.auth().setCustomUserClaims(uid, { companyId, role });
  return { success: true, companyId, role };
});

// -------------------- Locations: basic management via callable (optional) --------------------

export const createLocation = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const name = String(data?.name ?? '').trim();
  const code = String(data?.code ?? '').trim();
  if (!name) throw new functions.https.HttpsError('invalid-argument', 'Location name is required.');

  const ref = db.collection(`companies/${companyId}/locations`).doc();
  await ref.set({
    companyId,
    name,
    code,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: context.auth?.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true, id: ref.id };
});

export const updateLocation = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const id = String(data?.id ?? '').trim();
  if (!id) throw new functions.https.HttpsError('invalid-argument', 'id is required.');

  const updates: any = {};
  if (data?.name !== undefined) updates.name = String(data.name).trim();
  if (data?.code !== undefined) updates.code = String(data.code).trim();
  if (data?.active !== undefined) updates.active = !!data.active;
  updates.updatedAt = FieldValue.serverTimestamp();

  await db.doc(`companies/${companyId}/locations/${id}`).set(updates, { merge: true });
  return { success: true };
});

export const deleteLocation = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin']);

  const companyId = companyIdOf(context, data);
  const id = String(data?.id ?? '').trim();
  if (!id) throw new functions.https.HttpsError('invalid-argument', 'id is required.');

  await db.doc(`companies/${companyId}/locations/${id}`).delete();
  return { success: true };
});

// -------------------- Incoming FIFO --------------------

export const recordIncomingFifo = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const productCode = String(data?.productCode ?? '').trim().toUpperCase();
  const locationId = String(data?.locationId ?? '').trim();

  const qty = assertPositiveInt(data?.quantity, 'quantity');
  const unitCostMajor = assertNonNegativeNumber(data?.unitCost, 'unitCost');
  const currency = (data?.currency as Currency) || 'USD';
  const supplier = String(data?.supplier ?? '').trim();
  const fx = (data?.fx as FxSnapshot | undefined) ?? undefined;
  const incomeDate = data?.incomeDate ? new Date(data.incomeDate) : new Date();

  if (!productCode) throw new functions.https.HttpsError('invalid-argument', 'productCode is required.');
  if (!locationId) throw new functions.https.HttpsError('invalid-argument', 'locationId is required.');

  const company = await getCompany(companyId);
  const baseCurrency = (company.baseCurrency as Currency) || 'USD';

  const productRef = db.doc(`companies/${companyId}/products/${productCode}`);
  const stockRef = db.doc(`companies/${companyId}/locations/${locationId}/stock/${productCode}`);
  const incomingRef = db.collection(`companies/${companyId}/incomingProducts`).doc();

  const locationNameIncoming = await getLocationName(companyId, locationId);

  const businessDay = businessDayFromDate(incomeDate);
  const businessDate = businessDateFromDay(businessDay);

  await db.runTransaction(async (tx) => {
    const productSnap = await tx.get(productRef);
    if (!productSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'Product not found.');
    const product = productSnap.data() as any;

    const purchaseCurrency = (product.purchasePriceCurrency as Currency) || currency;
    if (purchaseCurrency !== currency) {
      throw new functions.https.HttpsError('invalid-argument', `Incoming currency must match product purchase currency (${purchaseCurrency}).`);
    }

    const unitCostMinor = toMinor(unitCostMajor, currency);
    const totalCostMinor = unitCostMinor * qty;

    let totalCostBaseMinor: number;
    if (currency === baseCurrency) {
      totalCostBaseMinor = totalCostMinor;
    } else {
      if (!fx || !Number.isFinite(fx.rateToBase) || fx.rateToBase <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'FX snapshot is required for cross-currency incoming.');
      }
      totalCostBaseMinor = convertMinorToBase(totalCostMinor, fx.rateToBase, currency, baseCurrency);
    }

    const unitCostBaseMinor = qty > 0 ? Math.round(totalCostBaseMinor / qty) : 0;

    // Update product total stock
    const oldQty = Number(product.quantity ?? 0);
    const newQty = oldQty + qty;

    tx.set(incomingRef, {
      companyId,
      productCode,
      quantity: qty,
      supplier,
      currency,
      unitCost: unitCostMajor,
      totalCost: unitCostMajor * qty,
      unitCostMinor,
      totalCostMinor,
      baseCurrency,
      ...(fx ? { fx } : {}),
      unitCostBaseMinor,
      totalCostBaseMinor,
      locationId,
      locationName: locationNameIncoming,
      incomeDate: Timestamp.fromDate(incomeDate),
      date: Timestamp.fromDate(incomeDate),
      businessDay,
      businessDate,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth?.uid,
    });

    tx.update(productRef, {
      quantity: newQty,
      lowStock: newQty <= Number(product.minStock ?? 0),
      updatedAt: FieldValue.serverTimestamp(),
      // Keep avg cost hints for UI, but FIFO is source of truth
      costBaseMinor: calcNewAvg(
        Number(product.costBaseMinor ?? unitCostBaseMinor) * oldQty + totalCostBaseMinor,
        newQty
      ),
      costMinor: calcNewAvg(
        Number(product.costMinor ?? unitCostMinor) * oldQty + totalCostMinor,
        newQty
      ),
    });

    // Update per-location stock
    const stockSnap = await tx.get(stockRef);
    const stock = stockSnap.exists ? (stockSnap.data() as any) : { quantity: 0, valueBaseMinor: 0 };

    const stockQtyOld = Number(stock.quantity ?? 0);
    const stockValueOld = Number(stock.valueBaseMinor ?? 0);

    const stockQtyNew = stockQtyOld + qty;
    const stockValueNew = stockValueOld + totalCostBaseMinor;

    tx.set(stockRef, {
      companyId,
      productId: productCode,
      productCode,
      productName: String(product.name ?? ''),
      quantity: stockQtyNew,
      valueBaseMinor: stockValueNew,
      avgCostBaseMinor: calcNewAvg(stockValueNew, stockQtyNew),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: stockSnap.exists ? (stock.createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    }, { merge: true });

    // Add FIFO layer
    const layerRef = stockRef.collection('layers').doc();
    tx.set(layerRef, {
      companyId,
      productId: productCode,
      remainingQty: qty,
      unitCostBaseMinor,
      source: 'incoming',
      sourceId: incomingRef.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return { success: true, incomingId: incomingRef.id };
});

// -------------------- Sales FIFO (single currency per sale, multi items) --------------------

export const recordSaleFifo = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'sales']);

  const companyId = companyIdOf(context, data);
  const company = await getCompany(companyId);
  const baseCurrency = (company.baseCurrency as Currency) || 'USD';

  const locationId = String(data?.locationId ?? '').trim();
  const clientId = String(data?.clientId ?? '').trim();
  const sellerId = String(data?.sellerId ?? '').trim();
  const paymentType = String(data?.paymentType ?? 'Cash') as 'Cash' | 'Partial' | 'Loan';
  const currency = (data?.currency as Currency) || baseCurrency;
  const fx = (data?.fx as FxSnapshot | undefined) ?? undefined;
  const saleDate = data?.date ? new Date(data.date) : new Date();

  const items = (data?.items as SaleItemInput[]) || [];

  if (!locationId) throw new functions.https.HttpsError('invalid-argument', 'locationId is required.');
  if (!clientId) throw new functions.https.HttpsError('invalid-argument', 'clientId is required.');
  if (!sellerId) throw new functions.https.HttpsError('invalid-argument', 'sellerId is required.');
  if (!Array.isArray(items) || items.length === 0) throw new functions.https.HttpsError('invalid-argument', 'items are required.');

  if (currency !== baseCurrency) {
    if (!fx || !Number.isFinite(fx.rateToBase) || fx.rateToBase <= 0) {
      throw new functions.https.HttpsError('invalid-argument', 'FX snapshot is required for cross-currency sale.');
    }
  }

  const discountMajor = assertNonNegativeNumber(data?.discount ?? 0, 'discount');
  const vatRate = assertNonNegativeNumber(data?.vatRate ?? 0, 'vatRate'); // e.g., 0.15

  const paidAtSaleMajor = assertNonNegativeNumber(data?.paidAtSale ?? 0, 'paidAtSale');

  const businessDay = businessDayFromDate(saleDate);
  const businessDate = businessDateFromDay(businessDay);

  const saleRef = db.collection(`companies/${companyId}/sales`).doc();
  const clientRef = db.doc(`companies/${companyId}/clients/${clientId}`);
  const clientLedgerRef = db.doc(`companies/${companyId}/clients/${clientId}/ledger/sale_${saleRef.id}`);

  // POS receipt numbering (optional)
  const posSettingsRef = db.doc(`companies/${companyId}/settings/pos`);

  const locationNameSale = await getLocationName(companyId, locationId);

  await db.runTransaction(async (tx) => {
    const clientSnap = await tx.get(clientRef);
    if (!clientSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'Client not found.');

    const locationName = locationNameSale;

    // Get receipt number
    let receiptNumber: string | undefined;
    const posSnap = await tx.get(posSettingsRef);
    const pos = posSnap.exists ? (posSnap.data() as any) : null;
    const next = Number(pos?.nextReceiptNumber ?? 1);
    receiptNumber = `${String(pos?.receiptPrefix ?? 'R').trim() || 'R'}-${String(next).padStart(6, '0')}`;
    tx.set(posSettingsRef, {
      companyId,
      nextReceiptNumber: next + 1,
      receiptPrefix: String(pos?.receiptPrefix ?? 'R'),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: posSnap.exists ? (pos?.createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
    }, { merge: true });

    let subtotalMinor = 0;
    const itemOutputs: any[] = [];
    const fifoByProduct: Record<string, { allocations: LayerAllocation[]; cogsBaseMinor: number }> = {};

    let totalCogsBaseMinor = 0;

    for (const it of items) {
      const productId = String(it.productId ?? '').trim().toUpperCase();
      const qty = assertPositiveInt(it.quantity, 'item.quantity');
      const unitPriceMajor = assertNonNegativeNumber(it.unitPrice, 'item.unitPrice');

      const productRef = db.doc(`companies/${companyId}/products/${productId}`);
      const stockRef = db.doc(`companies/${companyId}/locations/${locationId}/stock/${productId}`);

      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) throw new functions.https.HttpsError('failed-precondition', `Product not found: ${productId}`);
      const product = productSnap.data() as any;

      const stockSnap = await tx.get(stockRef);
      if (!stockSnap.exists) throw new functions.https.HttpsError('failed-precondition', `No stock at location for product: ${productId}`);
      const stock = stockSnap.data() as any;
      const stockQty = Number(stock.quantity ?? 0);
      if (stockQty < qty) throw new functions.https.HttpsError('failed-precondition', `Not enough stock at location for ${productId}.`);

      // Consume FIFO
      const layersQuery = stockRef.collection('layers')
        .where('remainingQty', '>', 0)
        .orderBy('createdAt', 'asc');

      const { allocations, cogsBaseMinor } = await consumeFifoLayers(tx, layersQuery, qty);
      fifoByProduct[productId] = { allocations, cogsBaseMinor };
      totalCogsBaseMinor += cogsBaseMinor;

      // Update stock document
      const valueBaseOld = Number(stock.valueBaseMinor ?? 0);
      const stockQtyNew = stockQty - qty;
      const valueBaseNew = valueBaseOld - cogsBaseMinor;

      tx.set(stockRef, {
        quantity: stockQtyNew,
        valueBaseMinor: valueBaseNew,
        avgCostBaseMinor: calcNewAvg(valueBaseNew, stockQtyNew),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Update product total quantity
      const productQtyOld = Number(product.quantity ?? 0);
      const productQtyNew = productQtyOld - qty;
      tx.set(productRef, {
        quantity: productQtyNew,
        lowStock: productQtyNew <= Number(product.minStock ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const unitPriceMinor = toMinor(unitPriceMajor, currency);
      const lineTotalMinor = unitPriceMinor * qty;
      subtotalMinor += lineTotalMinor;

      itemOutputs.push({
        productId,
        productCode: String(product.productCode ?? productId),
        productName: String(product.name ?? ''),
        quantity: qty,
        unitPrice: unitPriceMajor,
        unitPriceMinor,
        lineTotalMinor,
      });
    }

    const discountMinor = toMinor(discountMajor, currency);
    const taxableMinor = Math.max(0, subtotalMinor - discountMinor);
    const vatMinor = Math.round(taxableMinor * vatRate);
    const totalMinor = taxableMinor + vatMinor;

    let revenueBaseMinor: number;
    let totalBaseMinor: number;
    let discountBaseMinor: number;
    let vatBaseMinor: number;

    if (currency === baseCurrency) {
      revenueBaseMinor = subtotalMinor;
      totalBaseMinor = totalMinor;
      discountBaseMinor = discountMinor;
      vatBaseMinor = vatMinor;
    } else {
      revenueBaseMinor = convertMinorToBase(subtotalMinor, fx!.rateToBase, currency, baseCurrency);
      totalBaseMinor = convertMinorToBase(totalMinor, fx!.rateToBase, currency, baseCurrency);
      discountBaseMinor = convertMinorToBase(discountMinor, fx!.rateToBase, currency, baseCurrency);
      vatBaseMinor = convertMinorToBase(vatMinor, fx!.rateToBase, currency, baseCurrency);
    }

    const costOfGoodsSoldBaseMinor = totalCogsBaseMinor;

    let costOfGoodsSoldMinor: number;
    if (currency === baseCurrency) costOfGoodsSoldMinor = costOfGoodsSoldBaseMinor;
    else costOfGoodsSoldMinor = convertBaseToMinor(costOfGoodsSoldBaseMinor, fx!.rateToBase, currency, baseCurrency);

    const grossProfitMinor = subtotalMinor - discountMinor - vatMinor - costOfGoodsSoldMinor + vatMinor; // keep VAT neutral on GP
    const grossProfitBaseMinor = revenueBaseMinor - costOfGoodsSoldBaseMinor;

    // Paid at sale
    const paidAtSaleMinor = paymentType === 'Cash'
      ? totalMinor
      : paymentType === 'Partial'
        ? Math.min(totalMinor, toMinor(paidAtSaleMajor, currency))
        : 0;

    const dueMinor = Math.max(0, totalMinor - paidAtSaleMinor);

    // Store sale
    tx.set(saleRef, {
      companyId,
      clientId,
      sellerId,
      paymentType,
      date: Timestamp.fromDate(saleDate),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth?.uid,
      isDeleted: false,

      locationId,
      locationName,
      receiptNumber,
      shiftId: data?.shiftId ? String(data.shiftId) : undefined,

      baseCurrency,
      salePriceCurrency: currency,
      ...(fx ? { fx } : {}),

      items: itemOutputs,

      // Backward-compat fields for old UI (first item)
      productId: itemOutputs[0].productId,
      productCode: itemOutputs[0].productCode,
      productName: itemOutputs[0].productName,
      quantity: itemOutputs[0].quantity,
      salePrice: itemOutputs[0].unitPrice,
      clientName: String((clientSnap.data() as any)?.name ?? ''),
      sellerName: String(data?.sellerName ?? ''),

      revenueMinor: subtotalMinor,
      revenueBaseMinor,
      costOfGoodsSoldBaseMinor,
      costOfGoodsSoldMinor,
      grossProfitBaseMinor,
      grossProfitMinor,

      discountMinor,
      vatMinor,
      totalMinor,
      totalBaseMinor,

      businessDay,
      businessDate,

      fifo: {
        byProduct: Object.fromEntries(Object.entries(fifoByProduct).map(([pid, v]) => [pid, v])),
      },
    });

    // Ledger
    tx.set(clientLedgerRef, {
      companyId,
      clientId,
      type: 'purchase',
      currency,
      totalMinor: totalMinor,
      paidMinor: paidAtSaleMinor,
      dueMinor,
      relatedSaleId: saleRef.id,
      createdAt: FieldValue.serverTimestamp(),
      businessDay,
      businessDate,
      items: itemOutputs.map((x) => ({
        productId: x.productId,
        name: x.productName,
        qty: x.quantity,
        unitPriceMinor: x.unitPriceMinor,
        lineTotalMinor: x.lineTotalMinor,
      })),
      note: `Sale (${paymentType}) ${receiptNumber}`,
    });

    tx.set(clientRef, { lastActivityAt: FieldValue.serverTimestamp() }, { merge: true });
  });

  return { success: true, saleId: saleRef.id };
});

// -------------------- Refund / Exchange (FIFO integrity) --------------------

export const refundSaleFifo = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const saleId = String(data?.saleId ?? '').trim();
  const reason = String(data?.reason ?? '').trim();

  if (!saleId) throw new functions.https.HttpsError('invalid-argument', 'saleId is required.');

  const saleRef = db.doc(`companies/${companyId}/sales/${saleId}`);

  await db.runTransaction(async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists) throw new functions.https.HttpsError('failed-precondition', 'Sale not found.');
    const sale = saleSnap.data() as any;

    if (sale.isDeleted || sale.refundedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'Sale already refunded/deleted.');
    }

    const locationId = String(sale.locationId ?? '').trim();
    if (!locationId) throw new functions.https.HttpsError('failed-precondition', 'Sale has no locationId.');

    const items = (sale.items as any[]) || [{
      productId: sale.productId,
      productCode: sale.productCode,
      productName: sale.productName,
      quantity: sale.quantity,
      unitPriceMinor: sale.salePriceMinor,
      lineTotalMinor: sale.revenueMinor,
    }];

    const fifo = sale.fifo?.byProduct || {};

    // Reverse stock and FIFO
    for (const it of items) {
      const productId = String(it.productId).trim().toUpperCase();
      const qty = assertPositiveInt(it.quantity, 'quantity');
      const stockRef = db.doc(`companies/${companyId}/locations/${locationId}/stock/${productId}`);
      const productRef = db.doc(`companies/${companyId}/products/${productId}`);

      const stockSnap = await tx.get(stockRef);
      if (!stockSnap.exists) throw new functions.https.HttpsError('failed-precondition', `Stock doc missing for ${productId}.`);

      const allocs: LayerAllocation[] = (fifo?.[productId]?.allocations || []) as any;
      const cogsBaseMinor = Number(fifo?.[productId]?.cogsBaseMinor ?? 0);
      if (!Array.isArray(allocs) || allocs.length === 0) {
        throw new functions.https.HttpsError('failed-precondition', `FIFO allocation missing for ${productId}. Cannot refund safely.`);
      }

      await restoreFifoLayers(tx, stockRef, allocs);

      const stock = stockSnap.data() as any;
      const newQty = Number(stock.quantity ?? 0) + qty;
      const newValue = Number(stock.valueBaseMinor ?? 0) + cogsBaseMinor;
      tx.set(stockRef, {
        quantity: newQty,
        valueBaseMinor: newValue,
        avgCostBaseMinor: calcNewAvg(newValue, newQty),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const productSnap = await tx.get(productRef);
      if (productSnap.exists) {
        const product = productSnap.data() as any;
        const newTotalQty = Number(product.quantity ?? 0) + qty;
        tx.set(productRef, {
          quantity: newTotalQty,
          lowStock: newTotalQty <= Number(product.minStock ?? 0),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }

    // Ledger adjustment
    const clientId = String(sale.clientId ?? '').trim();
    const currency = (sale.salePriceCurrency as Currency) || (sale.baseCurrency as Currency) || 'USD';
    const totalMinor = Number(sale.totalMinor ?? sale.revenueMinor ?? 0);
    const refundLedgerRef = db.doc(`companies/${companyId}/clients/${clientId}/ledger/refund_${saleId}`);

    tx.set(refundLedgerRef, {
      companyId,
      clientId,
      type: 'adjustment',
      currency,
      totalMinor: -Math.abs(totalMinor),
      paidMinor: 0,
      dueMinor: -Math.abs(totalMinor),
      relatedSaleId: saleId,
      createdAt: FieldValue.serverTimestamp(),
      note: reason ? `Refund: ${reason}` : 'Refund',
      businessDay: sale.businessDay,
      businessDate: sale.businessDate,
    }, { merge: true });

    // Mark sale refunded
    tx.set(saleRef, {
      isDeleted: true,
      refundedAt: FieldValue.serverTimestamp(),
      refundedBy: context.auth?.uid,
      refundReason: reason,
    }, { merge: true });
  });

  return { success: true };
});

// -------------------- Transfers (move cost layers) --------------------

export const createTransferFifo = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const fromLocationId = String(data?.fromLocationId ?? '').trim();
  const toLocationId = String(data?.toLocationId ?? '').trim();
  const items = (data?.items as Array<{ productId: string; quantity: number }>) || [];

  if (!fromLocationId || !toLocationId) throw new functions.https.HttpsError('invalid-argument', 'fromLocationId and toLocationId are required.');
  if (fromLocationId == toLocationId) throw new functions.https.HttpsError('invalid-argument', 'from and to locations must be different.');
  if (!Array.isArray(items) || items.length === 0) throw new functions.https.HttpsError('invalid-argument', 'items are required.');

  const transferRef = db.collection(`companies/${companyId}/transfers`).doc();

  const fromNameTx = await getLocationName(companyId, fromLocationId);
  const toNameTx = await getLocationName(companyId, toLocationId);

  await db.runTransaction(async (tx) => {
    const fromName = fromNameTx;
    const toName = toNameTx;

    tx.set(transferRef, {
      companyId,
      fromLocationId,
      toLocationId,
      fromLocationName: fromName,
      toLocationName: toName,
      status: 'posted',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth?.uid,
    });

    for (const it of items) {
      const productId = String(it.productId ?? '').trim().toUpperCase();
      const qty = assertPositiveInt(it.quantity, 'quantity');

      const fromStockRef = db.doc(`companies/${companyId}/locations/${fromLocationId}/stock/${productId}`);
      const toStockRef = db.doc(`companies/${companyId}/locations/${toLocationId}/stock/${productId}`);

      const fromStockSnap = await tx.get(fromStockRef);
      if (!fromStockSnap.exists) throw new functions.https.HttpsError('failed-precondition', `No stock at source for ${productId}.`);
      const fromStock = fromStockSnap.data() as any;

      if (Number(fromStock.quantity ?? 0) < qty) throw new functions.https.HttpsError('failed-precondition', `Not enough stock at source for ${productId}.`);

      const layersQuery = fromStockRef.collection('layers').where('remainingQty', '>', 0).orderBy('createdAt', 'asc');
      const { allocations, cogsBaseMinor } = await consumeFifoLayers(tx, layersQuery, qty);

      // Update from stock qty/value
      const fromQtyNew = Number(fromStock.quantity ?? 0) - qty;
      const fromValNew = Number(fromStock.valueBaseMinor ?? 0) - cogsBaseMinor;
      tx.set(fromStockRef, {
        quantity: fromQtyNew,
        valueBaseMinor: fromValNew,
        avgCostBaseMinor: calcNewAvg(fromValNew, fromQtyNew),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Ensure to stock exists
      const toStockSnap = await tx.get(toStockRef);
      const toStock = toStockSnap.exists ? (toStockSnap.data() as any) : { quantity: 0, valueBaseMinor: 0 };
      const toQtyNew = Number(toStock.quantity ?? 0) + qty;
      const toValNew = Number(toStock.valueBaseMinor ?? 0) + cogsBaseMinor;

      tx.set(toStockRef, {
        companyId,
        productId,
        productCode: productId,
        productName: String(toStock.productName ?? fromStock.productName ?? ''),
        quantity: toQtyNew,
        valueBaseMinor: toValNew,
        avgCostBaseMinor: calcNewAvg(toValNew, toQtyNew),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: toStockSnap.exists ? (toStock.createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
      }, { merge: true });

      // Recreate layers on destination (preserve unit costs)
      for (const a of allocations) {
        const layerRef = toStockRef.collection('layers').doc();
        tx.set(layerRef, {
          companyId,
          productId,
          remainingQty: a.qty,
          unitCostBaseMinor: a.unitCostBaseMinor,
          source: 'transfer',
          sourceId: transferRef.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Record line item
      tx.set(transferRef.collection('items').doc(productId), {
        productId,
        quantity: qty,
        valueBaseMinor: cogsBaseMinor,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  return { success: true, transferId: transferRef.id };
});

// -------------------- Stocktake (count + adjustments, audit-safe) --------------------

export const applyStocktakeFifo = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'accounting']);

  const companyId = companyIdOf(context, data);
  const locationId = String(data?.locationId ?? '').trim();
  const note = String(data?.note ?? '').trim();
  const lines = (data?.lines as Array<{ productId: string; countedQty: number }>) || [];

  if (!locationId) throw new functions.https.HttpsError('invalid-argument', 'locationId is required.');
  if (!Array.isArray(lines) || lines.length === 0) throw new functions.https.HttpsError('invalid-argument', 'lines are required.');

  const stocktakeRef = db.collection(`companies/${companyId}/stocktakes`).doc();

  const locationNameStocktake = await getLocationName(companyId, locationId);

  await db.runTransaction(async (tx) => {
    const locationName = locationNameSale;
    tx.set(stocktakeRef, {
      companyId,
      locationId,
      locationName,
      status: 'applied',
      note,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: context.auth?.uid,
      appliedAt: FieldValue.serverTimestamp(),
    });

    for (const line of lines) {
      const productId = String(line.productId ?? '').trim().toUpperCase();
      const counted = assertNonNegativeNumber(line.countedQty, 'countedQty');
      if (!Number.isInteger(counted)) throw new functions.https.HttpsError('invalid-argument', 'countedQty must be an integer.');

      const stockRef = db.doc(`companies/${companyId}/locations/${locationId}/stock/${productId}`);
      const productRef = db.doc(`companies/${companyId}/products/${productId}`);

      const stockSnap = await tx.get(stockRef);
      const stock = stockSnap.exists ? (stockSnap.data() as any) : { quantity: 0, valueBaseMinor: 0, avgCostBaseMinor: 0 };
      const currentQty = Number(stock.quantity ?? 0);
      const diff = counted - currentQty;
      if (diff === 0) {
        tx.set(stocktakeRef.collection('lines').doc(productId), {
          productId,
          countedQty: counted,
          systemQty: currentQty,
          diff: 0,
          createdAt: FieldValue.serverTimestamp(),
        });
        continue;
      }

      // Positive diff: add adjustment layer
      if (diff > 0) {
        const unitCostBaseMinor = Number(stock.avgCostBaseMinor ?? 0) || 0;
        const valueBase = diff * unitCostBaseMinor;

        const newQty = currentQty + diff;
        const newValue = Number(stock.valueBaseMinor ?? 0) + valueBase;

        tx.set(stockRef, {
          companyId,
          productId,
          productCode: productId,
          quantity: newQty,
          valueBaseMinor: newValue,
          avgCostBaseMinor: calcNewAvg(newValue, newQty),
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: stockSnap.exists ? (stock.createdAt ?? FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
        }, { merge: true });

        const layerRef = stockRef.collection('layers').doc();
        tx.set(layerRef, {
          companyId,
          productId,
          remainingQty: diff,
          unitCostBaseMinor,
          source: 'stocktake',
          sourceId: stocktakeRef.id,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        // Update product total
        const prodSnap = await tx.get(productRef);
        if (prodSnap.exists) {
          const prod = prodSnap.data() as any;
          const newTotal = Number(prod.quantity ?? 0) + diff;
          tx.set(productRef, { quantity: newTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }

        tx.set(stocktakeRef.collection('lines').doc(productId), {
          productId,
          countedQty: counted,
          systemQty: currentQty,
          diff,
          adjustmentValueBaseMinor: valueBase,
          createdAt: FieldValue.serverTimestamp(),
        });

        continue;
      }

      // Negative diff: consume FIFO as shrink
      const shrinkQty = Math.abs(diff);
      const layersQuery = stockRef.collection('layers').where('remainingQty', '>', 0).orderBy('createdAt', 'asc');
      const { allocations, cogsBaseMinor } = await consumeFifoLayers(tx, layersQuery, shrinkQty);

      const newQty = currentQty - shrinkQty;
      const newValue = Number(stock.valueBaseMinor ?? 0) - cogsBaseMinor;

      tx.set(stockRef, {
        quantity: newQty,
        valueBaseMinor: newValue,
        avgCostBaseMinor: calcNewAvg(newValue, newQty),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const prodSnap = await tx.get(productRef);
      if (prodSnap.exists) {
        const prod = prodSnap.data() as any;
        const newTotal = Number(prod.quantity ?? 0) - shrinkQty;
        tx.set(productRef, { quantity: newTotal, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }

      tx.set(stocktakeRef.collection('lines').doc(productId), {
        productId,
        countedQty: counted,
        systemQty: currentQty,
        diff,
        shrinkValueBaseMinor: cogsBaseMinor,
        fifoAllocations: allocations,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });

  return { success: true, stocktakeId: stocktakeRef.id };
});

// -------------------- POS Shifts --------------------

export const openShift = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'sales']);

  const companyId = companyIdOf(context, data);
  const locationId = String(data?.locationId ?? '').trim();
  const openingCashMajor = assertNonNegativeNumber(data?.openingCash ?? 0, 'openingCash');

  if (!locationId) throw new functions.https.HttpsError('invalid-argument', 'locationId is required.');

  const company = await getCompany(companyId);
  const baseCurrency = (company.baseCurrency as Currency) || 'USD';

  const shiftRef = db.collection(`companies/${companyId}/locations/${locationId}/shifts`).doc();
  await shiftRef.set({
    companyId,
    locationId,
    locationName: locationNameIncoming,
    status: 'open',
    openedAt: FieldValue.serverTimestamp(),
    openedBy: context.auth?.uid,
    openingCashMinor: toMinor(openingCashMajor, baseCurrency),
    baseCurrency,
  });

  return { success: true, shiftId: shiftRef.id };
});

export const closeShift = functions.region('us-central1').https.onCall(async (data, context) => {
  requireAuth(context);
  requireOneOfRoles(context, ['developer', 'admin', 'manager', 'sales']);

  const companyId = companyIdOf(context, data);
  const locationId = String(data?.locationId ?? '').trim();
  const shiftId = String(data?.shiftId ?? '').trim();
  const closingCashMajor = assertNonNegativeNumber(data?.closingCash ?? 0, 'closingCash');

  if (!locationId || !shiftId) throw new functions.https.HttpsError('invalid-argument', 'locationId and shiftId are required.');

  const company = await getCompany(companyId);
  const baseCurrency = (company.baseCurrency as Currency) || 'USD';

  const shiftRef = db.doc(`companies/${companyId}/locations/${locationId}/shifts/${shiftId}`);

  // Sum cash sales for this shift
  const salesSnap = await db.collection(`companies/${companyId}/sales`)
    .where('shiftId', '==', shiftId)
    .where('locationId', '==', locationId)
    .get();

  let cashSalesBaseMinor = 0;
  salesSnap.forEach((d) => {
    const s = d.data() as any;
    if (String(s.paymentType ?? '').toLowerCase() !== 'cash') return;
    cashSalesBaseMinor += Number(s.totalBaseMinor ?? s.revenueBaseMinor ?? 0);
  });

  const closingCashMinor = toMinor(closingCashMajor, baseCurrency);

  await shiftRef.set({
    status: 'closed',
    closedAt: FieldValue.serverTimestamp(),
    closedBy: context.auth?.uid,
    closingCashMinor,
    cashSalesBaseMinor,
    cashDifferenceBaseMinor: closingCashMinor - cashSalesBaseMinor,
  }, { merge: true });

  return { success: true, cashSalesBaseMinor };
});

// -------------------- Telegram alerts (trigger) --------------------

export const notifySaleToTelegram = functions
  .region('us-central1')
  .firestore.document('companies/{companyId}/sales/{saleId}')
  .onCreate(async (snap, ctx) => {
    const sale = snap.data() as any;
    if (!sale) return null;

    const companyId = ctx.params.companyId;
    const companySnap = await db.doc(`companies/${companyId}`).get();
    if (!companySnap.exists) return null;
    const company = companySnap.data() as any;

    if (!company.telegramAlertsEnabled) return null;
    const chatId = String(company.telegramChatId || '').trim();
    if (!chatId) return null;

    const totalBase = Number(sale.totalBaseMinor ?? sale.revenueBaseMinor ?? 0);
    const baseCurrency = (company.baseCurrency as Currency) || 'USD';

    const locationName = String(sale.locationName ?? '');
    const receipt = String(sale.receiptNumber ?? sale.id);

    const text = [
      `🧾 Sale: ${receipt}`,
      locationName ? `🏪 Location: ${locationName}` : '',
      `💰 Total (${baseCurrency} minor): ${totalBase}`,
      `👤 Client: ${String(sale.clientName ?? '')}`,
    ].filter(Boolean).join('\n');

    await sendTelegramMessage(chatId, text);
    return null;
  });


export const notifyLowStockToTelegram = functions
  .region('us-central1')
  .firestore.document('companies/{companyId}/products/{productId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() as any;
    const after = change.after.data() as any;
    if (!before || !after) return null;

    const becameLow = !before.lowStock && !!after.lowStock;
    if (!becameLow) return null;

    const companyId = ctx.params.companyId;
    const companySnap = await db.doc(`companies/${companyId}`).get();
    if (!companySnap.exists) return null;
    const company = companySnap.data() as any;

    if (!company.telegramAlertsEnabled) return null;
    const chatId = String(company.telegramChatId || '').trim();
    if (!chatId) return null;

    const baseCurrency = (company.baseCurrency as Currency) || 'USD';
    const text = [
      `⚠️ Low stock: ${String(after.name || after.productCode || ctx.params.productId)}`,
      `Code: ${String(after.productCode || ctx.params.productId)}`,
      `Qty: ${Number(after.quantity ?? 0)}`,
      `Min: ${Number(after.minStock ?? 0)}`,
      `Company currency: ${baseCurrency}`,
    ].join('\n');

    await sendTelegramMessage(chatId, text);
    return null;
  });
