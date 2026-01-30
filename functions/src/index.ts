
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { Company, Currency, Product, Sale, UserRole } from './types';
import { fromMinor, toMinor, convertMinorToBase, convertBaseToMinor } from './money';

if (!admin.apps.length) {
  admin.initializeApp();
}

admin.firestore().settings({ ignoreUndefinedProperties: true });

const firestore = admin.firestore();

async function setMergedCustomClaims(
  userId: string,
  newClaims: Record<string, any>
): Promise<void> {
  const user = await admin.auth().getUser(userId);
  const existingClaims = user.customClaims || {};
  const mergedClaims = { ...existingClaims, ...newClaims };
  await admin.auth().setCustomUserClaims(userId, mergedClaims);
}

export const recalculateSalesFinancials = functions.https.onCall(async (data, context) => {
  const companyId = data.companyId;
  if (!companyId) {
      throw new functions.https.HttpsError('invalid-argument', 'The function must be called with a "companyId".');
  }

  const companyDoc = await firestore.doc(`companies/${companyId}`).get();
  if (!companyDoc.exists) {
      throw new functions.https.HttpsError('not-found', `Company with ID ${companyId} not found.`);
  }
  const company = companyDoc.data() as Company;
  // Ensure company has a base currency.
  const companyBaseCurrency = company.baseCurrency;
  if (!companyBaseCurrency) {
      throw new functions.https.HttpsError('failed-precondition', `Company ${companyId} does not have a base currency set.`);
  }

  const salesQuery = await firestore.collection(`companies/${companyId}/sales`).get();
  const updatePromises: Promise<any>[] = [];

  for (const doc of salesQuery.docs) {
      const sale = doc.data() as Sale;
      const saleId = doc.id;

      // 1. Handle potentially undefined fx rate, default to 1
      const fxRate = sale.fx?.enteredRate ?? 1;

      // 2. Use correct currency property: 'salePriceCurrency'
      const localCurrency = sale.salePriceCurrency;

      // 3. Use sale's base currency or fallback to company's
      const baseCurrency = sale.baseCurrency ?? companyBaseCurrency;

      const costOfGoodsSoldBaseMinor = convertMinorToBase(
          // 4. Handle potentially undefined cost, default to 0
          sale.costOfGoodsSoldMinor ?? 0,
          fxRate,
          localCurrency,
          baseCurrency
      );

      const updatePromise = firestore.doc(`companies/${companyId}/sales/${saleId}`).update({
          costOfGoodsSoldBaseMinor,
      });
      updatePromises.push(updatePromise);
  }

  await Promise.all(updatePromises);

  return {
      message: "Sales financials recalculated successfully.",
      salesUpdated: updatePromises.length,
  };
});

// New Deep Repair function
export const deepRepairFinancials = functions.region('us-central1').runWith({ timeoutSeconds: 540 }).https.onCall(async (data, context) => {
    if (!context.auth || (context.auth.token.role !== 'developer' && context.auth.token.role !== 'admin')) {
        throw new functions.https.HttpsError('permission-denied', 'Admin or Developer required.');
    }

    const { companyId, dryRun = false } = data;
    if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required.');
    
    const companySnap = await firestore.doc(`companies/${companyId}`).get();
    if (!companySnap.exists) throw new functions.https.HttpsError('not-found', 'Company not found.');
    const company = companySnap.data() as Company;
    const baseCurrency = company.baseCurrency || 'USD';
    
    const productsRef = firestore.collection(`companies/${companyId}/products`);
    const salesRef = firestore.collection(`companies/${companyId}/sales`);
    
    const log: string[] = [];
    log.push(`Starting Deep Repair for company ${companyId}. Dry Run: ${dryRun}`);
    
    // --- Phase A: Repair Products ---
    log.push('--- Phase A: Repairing Products ---');
    const productsSnap = await productsRef.get();
    const productCostMap = new Map<string, { costMinor: number, costBaseMinor: number, currency: Currency }>();
    const productBatch = firestore.batch();
    let productUpdateCount = 0;

    for (const doc of productsSnap.docs) {
        const p = doc.data() as Product;
        let needsUpdate = false;
        const updates: any = {};

        // 1. Fallback for missing currency
        const currency = (p.purchasePriceCurrency || baseCurrency) as Currency;
        if (!p.purchasePriceCurrency) {
            updates.purchasePriceCurrency = currency;
            needsUpdate = true;
            log.push(`  - Product ${doc.id}: Missing currency. Defaulting to ${currency}.`);
        }

        // 2. Recalculate costMinor from the original 'cost' field
        const correctCostMinor = toMinor(p.cost || 0, currency);
        if (p.costMinor !== correctCostMinor) {
            updates.costMinor = correctCostMinor;
            needsUpdate = true;
        }

        // 3. Recalculate costBaseMinor
        let correctCostBaseMinor: number;
        if (currency === baseCurrency) {
            correctCostBaseMinor = correctCostMinor;
        } else if (p.costFx?.rateToBase) {
            correctCostBaseMinor = convertMinorToBase(correctCostMinor, p.costFx.rateToBase, currency, baseCurrency);
        } else {
            // Fallback: Assume 1:1 if no FX rate is found. This is a repair assumption.
            correctCostBaseMinor = correctCostMinor;
            log.push(`  - Product ${doc.id}: No exchange rate found for ${currency} -> ${baseCurrency}. Assuming 1:1 for repair.`);
        }

        if (p.costBaseMinor !== correctCostBaseMinor) {
            updates.costBaseMinor = correctCostBaseMinor;
            needsUpdate = true;
        }
        
        // Store in map for Phase B
        productCostMap.set(doc.id, { costMinor: correctCostMinor, costBaseMinor: correctCostBaseMinor, currency });

        if (needsUpdate) {
            log.push(`  - Staging update for Product ${doc.id} with updates: ${JSON.stringify(updates)}`);
            productUpdateCount++;
            productBatch.update(doc.ref, updates);
        }
    }
    
    if (!dryRun && productUpdateCount > 0) await productBatch.commit();
    log.push(`Phase A Complete. Updated ${productUpdateCount} products.`);


    // --- Phase B: Recalculate All Sales ---
    log.push('--- Phase B: Recalculating Sales ---');
    const salesSnap = await salesRef.get();
    const salesBatch = firestore.batch();
    let salesUpdateCount = 0;
    
    for (const doc of salesSnap.docs) {
        const s = doc.data() as Sale;
        const productCosts = productCostMap.get(s.productId);

        if (!productCosts) {
            log.push(`  - Sale ${doc.id}: WARNING! Product ${s.productId} not found. Cannot recalculate. Skipping.`);
            continue;
        }
        
        const quantity = s.quantity || 0;
        const saleCurrency = s.salePriceCurrency;

        // Recalculate COGS in base currency
        const cogsBaseMinor = productCosts.costBaseMinor * quantity;
        
        // Recalculate revenue in base currency (if needed)
        const revenueMinor = s.revenueMinor ?? toMinor((s.salePrice || 0) * quantity, saleCurrency);
        let revenueBaseMinor = s.revenueBaseMinor;
        if (saleCurrency === baseCurrency) {
            revenueBaseMinor = revenueMinor;
        } else if (s.fx?.rateToBase) {
            revenueBaseMinor = convertMinorToBase(revenueMinor, s.fx.rateToBase, saleCurrency, baseCurrency);
        }
        // If revenueBaseMinor is still undefined, we cannot calculate base profit.
        if (revenueBaseMinor === undefined) {
             log.push(`  - Sale ${doc.id}: Cannot determine base revenue. Skipping base profit calc.`);
             revenueBaseMinor = 0; // fallback to prevent NaN
        }
        
        // Recalculate Profit in Base Currency
        const grossProfitBaseMinor = revenueBaseMinor - cogsBaseMinor;
        
        // Recalculate COGS and Profit in Local Currency
        const cogsMinor = convertBaseToMinor(cogsBaseMinor, s.fx?.rateToBase || 1, saleCurrency, baseCurrency);
        const grossProfitMinor = revenueMinor - cogsMinor;
        
        const updates = {
            costOfGoodsSoldBaseMinor: cogsBaseMinor,
            grossProfitBaseMinor: grossProfitBaseMinor,
            costOfGoodsSoldMinor: cogsMinor,
            grossProfitMinor: grossProfitMinor,
        };

        salesBatch.update(doc.ref, updates);
        salesUpdateCount++;
    }

    if (!dryRun && salesUpdateCount > 0) await salesBatch.commit();
    log.push(`Phase B Complete. Recalculated ${salesUpdateCount} sales.`);

    return {
        success: true,
        dryRun,
        productsFound: productsSnap.size,
        productsUpdated: productUpdateCount,
        salesFound: salesSnap.size,
        salesRecalculated: salesUpdateCount,
        logs: log,
    };
});
