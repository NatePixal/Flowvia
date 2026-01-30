
import admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function isFiniteInt(x) {
  return Number.isFinite(Number(x)) && Number.isInteger(Number(x));
}

function toNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function divRoundPositiveBigInt(numer, denom) {
  if (denom === 0n) return 0n;
  return (numer + denom / 2n) / denom;
}

function convertMinorToBase(minor, rateToBase, txnDecimals, baseDecimals) {
  const m = toNum(minor, 0);
  const r = toNum(rateToBase, 1);
  if (!Number.isFinite(m) || !Number.isFinite(r)) return 0;

  const txnFactor = Math.pow(10, txnDecimals);
  const baseFactor = Math.pow(10, baseDecimals);

  const txnMajor = m / txnFactor;
  const baseMajor = txnMajor * r;
  return Math.round(baseMajor * baseFactor);
}

function convertBaseToMinor(baseMinor, rateToBase, txnDecimals, baseDecimals) {
  const bm = toNum(baseMinor, 0);
  const r = toNum(rateToBase, 1);
  if (!Number.isFinite(bm) || !Number.isFinite(r) || r === 0) return 0;

  const txnFactor = Math.pow(10, txnDecimals);
  const baseFactor = Math.pow(10, baseDecimals);

  const baseMajor = bm / baseFactor;
  const txnMajor = baseMajor / r;
  return Math.round(txnMajor * txnFactor);
}

export async function deepRepairFinancials({
  companyId,
  dryRun = true,
  batchSize = 400,
  currencyDecimals = {}, // e.g. { USD: 2, UZS: 0 }
}) {
  if (!companyId) throw new Error("companyId is required");

  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) throw new Error(`Company not found: ${companyId}`);

  const company = companySnap.data() || {};
  const baseCurrency = company.baseCurrency || "USD";
  const baseDecimals = currencyDecimals[baseCurrency] ?? 2;

  const productsSnap = await companyRef.collection("products").get();
  const products = productsSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }));

  const incomingCollections = ["incomingProducts", "incomingProductLogs", "incoming"];
  let incomingDocs = [];
  for (const name of incomingCollections) {
    const snap = await companyRef.collection(name).get();
    if (!snap.empty) {
      incomingDocs = snap.docs.map(d => ({ id: d.id, data: d.data() || {} }));
      break;
    }
  }

  const incomingByProduct = new Map();
  for (const doc of incomingDocs) {
    const productId = doc.data.productId;
    if (!productId) continue;
    if (!incomingByProduct.has(productId)) incomingByProduct.set(productId, []);
    incomingByProduct.get(productId).push(doc.data);
  }

  for (const [pid, arr] of incomingByProduct.entries()) {
    arr.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? b.createdAt?.seconds ?? 0;
      return ta - tb;
    });
  }

  const productCostMap = new Map();
  const productFixes = [];
  const productWarnings = [];

  for (const p of products) {
    const d = p.data;
    const purchaseCurrency = d.purchasePriceCurrency || d.costCurrency || baseCurrency;
    const purchaseDecimals = currencyDecimals[purchaseCurrency] ?? 2;
    const logs = incomingByProduct.get(p.id) || [];
    let totalQty = 0n;
    let totalValueMinor = 0n;
    let totalValueBaseMinor = 0n;

    for (const log of logs) {
      const qty = BigInt(Math.max(0, Math.trunc(toNum(log.quantity ?? log.qty, 0))));
      if (qty === 0n) continue;

      const unitCostMinor = toNum(log.unitCostMinor ?? log.costMinor ?? 0, 0);
      const unitCostBaseMinor = toNum(log.unitCostBaseMinor ?? log.costBaseMinor ?? 0, 0);

      if (Number.isFinite(unitCostMinor) && Number.isFinite(unitCostBaseMinor)) {
        totalQty += qty;
        totalValueMinor += BigInt(Math.trunc(unitCostMinor)) * qty;
        totalValueBaseMinor += BigInt(Math.trunc(unitCostBaseMinor)) * qty;
        continue;
      }

      const unitCostMajor = toNum(log.unitCost ?? log.cost ?? 0, 0);
      const logCurrency = log.currency || purchaseCurrency;
      const logDecimals = currencyDecimals[logCurrency] ?? 2;
      const rateToBase = log.fxSnapshot?.rateToBase ?? log.fx?.rateToBase ?? null;
      const ucMinor = Math.round(unitCostMajor * Math.pow(10, logDecimals));
      let ucBaseMinor = 0;

      if (logCurrency === baseCurrency) {
        ucBaseMinor = ucMinor;
      } else if (rateToBase != null) {
        ucBaseMinor = convertMinorToBase(ucMinor, rateToBase, logDecimals, baseDecimals);
      } else {
        productWarnings.push({
          productId: p.id,
          type: "MISSING_FX_ON_INCOMING",
          message: `Incoming log missing fx rate for ${logCurrency}->${baseCurrency}. Base cost will be approximate/zero.`,
        });
      }
      totalQty += qty;
      totalValueMinor += BigInt(ucMinor) * qty;
      totalValueBaseMinor += BigInt(ucBaseMinor) * qty;
    }

    let newCostMinor = 0;
    let newCostBaseMinor = 0;

    if (totalQty > 0n) {
      newCostMinor = Number(divRoundPositiveBigInt(totalValueMinor, totalQty));
      newCostBaseMinor = Number(divRoundPositiveBigInt(totalValueBaseMinor, totalQty));
    } else {
      const fallbackCostMajor = toNum(d.cost ?? d.purchasePrice ?? 0, 0);
      newCostMinor = Math.round(fallbackCostMajor * Math.pow(10, purchaseDecimals));
      if (purchaseCurrency === baseCurrency) {
        newCostBaseMinor = newCostMinor;
      } else {
        const rateToBase = d.fxSnapshot?.rateToBase ?? d.fx?.rateToBase ?? null;
        if (rateToBase != null) {
          newCostBaseMinor = convertMinorToBase(newCostMinor, rateToBase, purchaseDecimals, baseDecimals);
        } else {
          newCostBaseMinor = 0;
          productWarnings.push({
            productId: p.id,
            type: "MISSING_FX_ON_PRODUCT",
            message: `Product missing fx rate for ${purchaseCurrency}->${baseCurrency}. Set costBaseMinor=0; requires manual fix or attach rates.`,
          });
        }
      }
    }

    if (!isFiniteInt(newCostMinor) || newCostMinor < 0) newCostMinor = 0;
    if (!isFiniteInt(newCostBaseMinor) || newCostBaseMinor < 0) newCostBaseMinor = 0;

    productCostMap.set(p.id, { purchaseCurrency, costMinor: newCostMinor, costBaseMinor: newCostBaseMinor });

    const oldCostMinor = d.costMinor;
    const oldCostBaseMinor = d.costBaseMinor;
    const needsUpdate = !isFiniteInt(oldCostMinor) || !isFiniteInt(oldCostBaseMinor) || Number(oldCostMinor) !== newCostMinor || Number(oldCostBaseMinor) !== newCostBaseMinor || d.purchasePriceCurrency !== purchaseCurrency;

    if (needsUpdate) {
      productFixes.push({
        productId: p.id,
        old: { costMinor: oldCostMinor, costBaseMinor: oldCostBaseMinor, purchasePriceCurrency: d.purchasePriceCurrency },
        next: { costMinor: newCostMinor, costBaseMinor: newCostBaseMinor, purchasePriceCurrency: purchaseCurrency },
      });
    }
  }

  const salesSnap = await companyRef.collection("sales").get();
  const sales = salesSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }));
  const saleFixes = [];
  const saleWarnings = [];

  for (const s of sales) {
    const d = s.data;
    const productId = d.productId;
    const qty = Math.max(0, Math.trunc(toNum(d.quantity ?? d.qty, 0)));
    const saleCurrency = d.salePriceCurrency || d.currency || baseCurrency;
    const saleDecimals = currencyDecimals[saleCurrency] ?? 2;
    const cost = productCostMap.get(productId);

    if (!cost) {
      saleWarnings.push({ saleId: s.id, type: "MISSING_PRODUCT", message: `No product found for productId=${productId}` });
      continue;
    }

    let revenueMinor = d.revenueMinor;
    if (!isFiniteInt(revenueMinor)) {
      const salePrice = toNum(d.salePrice ?? d.price ?? 0, 0);
      revenueMinor = Math.round((salePrice * qty) * Math.pow(10, saleDecimals));
    }

    const rateToBase = d.fxSnapshot?.rateToBase ?? d.fx?.rateToBase ?? d.rateToBase ?? null;
    let revenueBaseMinor;

    if (saleCurrency === baseCurrency) {
      revenueBaseMinor = Number(revenueMinor);
    } else if (rateToBase != null) {
      revenueBaseMinor = convertMinorToBase(Number(revenueMinor), rateToBase, saleDecimals, baseDecimals);
    } else {
      revenueBaseMinor = 0;
      saleWarnings.push({
        saleId: s.id,
        type: "MISSING_FX_ON_SALE",
        message: `Sale missing fx rate for ${saleCurrency}->${baseCurrency}. Set revenueBaseMinor=0; requires rate.`,
      });
    }

    const cogsBaseMinor = (isFiniteInt(cost.costBaseMinor) ? cost.costBaseMinor : 0) * qty;
    const grossProfitBaseMinor = revenueBaseMinor - cogsBaseMinor;
    let grossProfitMinor = 0;

    if (saleCurrency === baseCurrency) {
      grossProfitMinor = grossProfitBaseMinor;
    } else if (rateToBase != null) {
      const cogsMinor = convertBaseToMinor(cogsBaseMinor, rateToBase, saleDecimals, baseDecimals);
      grossProfitMinor = Number(revenueMinor) - cogsMinor;
    } else {
      grossProfitMinor = 0;
    }

    const patch = {
      revenueMinor: Number(revenueMinor),
      revenueBaseMinor,
      costOfGoodsSoldBaseMinor: cogsBaseMinor,
      grossProfitBaseMinor,
      grossProfitMinor,
      repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      repairVersion: "deep-repair-v1",
    };

    saleFixes.push({ saleId: s.id, patch });
  }

  const report = {
    companyId,
    baseCurrency,
    dryRun,
    productsTotal: products.length,
    productsToUpdate: productFixes.length,
    salesTotal: sales.length,
    salesToUpdate: saleFixes.length,
    productWarningsCount: productWarnings.length,
    saleWarningsCount: saleWarnings.length,
    productWarnings: productWarnings.slice(0, 25),
    saleWarnings: saleWarnings.slice(0, 25),
    sampleProductFixes: productFixes.slice(0, 10),
    sampleSaleFixes: saleFixes.slice(0, 10),
  };

  if (dryRun) return report;

  let batch = db.batch();
  let ops = 0;

  for (const fix of productFixes) {
    const pRef = companyRef.collection("products").doc(fix.productId);
    batch.update(pRef, {
      costMinor: fix.next.costMinor,
      costBaseMinor: fix.next.costBaseMinor,
      purchasePriceCurrency: fix.next.purchasePriceCurrency,
      repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      repairVersion: "deep-repair-v1",
    });
    ops++;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  for (const fix of saleFixes) {
    const sRef = companyRef.collection("sales").doc(fix.saleId);
    batch.update(sRef, fix.patch);
    ops++;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  // Clean the report before saving
  report.sampleSaleFixes.forEach(fix => {
    delete fix.patch.repairedAt;
  });

  await companyRef.collection("repairs").add({
    ...report,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return report;
}
