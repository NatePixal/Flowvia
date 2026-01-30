import admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const DEFAULT_DECIMALS = { USD: 2, UZS: 2, AED: 2, CNY: 2, EUR: 2, GBP: 2 };

const isInt = (v) => Number.isInteger(Number(v)) && Number.isFinite(Number(v));
const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

function toMinor(amountMajor, currency, decimalsMap) {
  const n = num(amountMajor, 0);
  const d = (decimalsMap[currency] ?? 2);
  return Math.round(n * Math.pow(10, d));
}

function convertMinorToBase(minorTxn, rateToBase, txnCurrency, baseCurrency, decimalsMap) {
  const m = num(minorTxn, 0);
  const r = num(rateToBase, NaN);
  if (!Number.isFinite(r) || r <= 0) return null;

  const txnD = decimalsMap[txnCurrency] ?? 2;
  const baseD = decimalsMap[baseCurrency] ?? 2;

  const txnMajor = m / Math.pow(10, txnD);
  const baseMajor = txnMajor * r;
  return Math.round(baseMajor * Math.pow(10, baseD));
}

function convertBaseToMinor(minorBase, rateToBase, txnCurrency, baseCurrency, decimalsMap) {
  const bm = num(minorBase, 0);
  const r = num(rateToBase, NaN);
  if (!Number.isFinite(r) || r <= 0) return null;

  const txnD = decimalsMap[txnCurrency] ?? 2;
  const baseD = decimalsMap[baseCurrency] ?? 2;

  const baseMajor = bm / Math.pow(10, baseD);
  const txnMajor = baseMajor / r;
  return Math.round(txnMajor * Math.pow(10, txnD));
}

// tries common field names
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

async function detectCollections(companyRef) {
  const cols = await companyRef.listCollections();
  const names = cols.map(c => c.id);

  const findBest = (needle) => {
    const lower = needle.toLowerCase();
    const hits = names.filter(n => n.toLowerCase().includes(lower));
    return hits;
  };

  return {
    all: names,
    productsCandidates: findBest("product"),
    salesCandidates: findBest("sale"),
    incomingCandidates: names.filter(n =>
      n.toLowerCase().includes("incoming") || n.toLowerCase().includes("stock") || n.toLowerCase().includes("receive")
    ),
  };
}

export async function forensicFinancialsV2({ companyId, decimals = DEFAULT_DECIMALS }) {
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) throw new Error(`Company not found: ${companyId}`);

  const company = companySnap.data() || {};
  const baseCurrency = company.baseCurrency || "USD";

  const colInfo = await detectCollections(companyRef);

  // Choose most likely collections (first match)
  const names = colInfo.all.map(s => String(s));

  const productsCol = names.includes("products") ? "products" : "products";
  const salesCol = names.includes("sales") ? "sales" : "sales";
  const incomingCol = names.includes("incomingProducts") ? "incomingProducts" : "incomingProducts";

  const productsSnap = await companyRef.collection(productsCol).get();
  const salesSnap = await companyRef.collection(salesCol).get();
  const incomingSnap = await companyRef.collection(incomingCol).get().catch(() => ({ docs: [] }));

  const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sales = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const incoming = (incomingSnap.docs || []).map(d => ({ id: d.id, ...d.data() }));

  // Build incoming by productId
  const incomingByProduct = new Map();
  for (const x of incoming) {
    const pid = x.productId;
    if (!pid) continue;
    if (!incomingByProduct.has(pid)) incomingByProduct.set(pid, []);
    incomingByProduct.get(pid).push(x);
  }

  // Outlier scan on sales
  const saleOutliers = sales
    .map(s => {
      const gp = num(s.grossProfitBaseMinor, 0);
      const revB = num(s.revenueBaseMinor, 0);
      const cogsB = num(s.costOfGoodsSoldBaseMinor, 0);

      const currency = pick(s, ["salePriceCurrency", "currency"]) || baseCurrency;
      const qty = Math.max(0, Math.trunc(num(pick(s, ["quantity", "qty"]), 0)));
      const salePriceMajor = num(pick(s, ["salePrice", "price", "unitPrice"]), NaN);

      // expected revenueMinor from salePrice*qty if we have salePrice
      let expectedRevenueMinor = null;
      if (Number.isFinite(salePriceMajor)) {
        const unitMinor = toMinor(salePriceMajor, currency, decimals);
        expectedRevenueMinor = unitMinor * qty;
      }

      const storedRevenueMinor = isInt(s.revenueMinor) ? Number(s.revenueMinor) : null;
      let scale = null;
      if (expectedRevenueMinor && storedRevenueMinor !== null && expectedRevenueMinor !== 0) {
        scale = storedRevenueMinor / expectedRevenueMinor; // 1 means consistent, 0.01/100 means major/minor mismatch
      }

      return {
        id: s.id,
        currency,
        qty,
        salePriceMajor: Number.isFinite(salePriceMajor) ? salePriceMajor : null,
        grossProfitBaseMinor: gp,
        revenueBaseMinor: revB,
        cogsBaseMinor: cogsB,
        revenueMinor: storedRevenueMinor,
        expectedRevenueMinor,
        scale,
        fxRateToBase: pick(s, ["fxSnapshot", "fx"])?.rateToBase ?? pick(s, ["rateToBase"]),
      };
    })
    .sort((a, b) => Math.abs(b.grossProfitBaseMinor) - Math.abs(a.grossProfitBaseMinor))
    .slice(0, 15);

  // Count suspicious patterns
  const suspicious = {
    salesMissingFx: 0,
    salesFxHuge: 0,
    salesRevenueScaleMismatch: 0,
    salesNonIntFields: 0,
    productsCostNonInt: 0,
    productsMissingCurrency: 0,
  };

  for (const s of sales) {
    const currency = pick(s, ["salePriceCurrency", "currency"]) || baseCurrency;
    const rate = pick(s, ["fxSnapshot", "fx"])?.rateToBase ?? pick(s, ["rateToBase"]);
    if (currency !== baseCurrency) {
      if (rate === undefined || rate === null) suspicious.salesMissingFx++;
      else if (num(rate, 0) > 10) suspicious.salesFxHuge++; // for USD base with UZS/AED this is a red flag
    }

    if (!isInt(s.revenueMinor) || !isInt(s.revenueBaseMinor) || !isInt(s.grossProfitBaseMinor)) {
      suspicious.salesNonIntFields++;
    }
  }

  for (const p of products) {
    if (!pick(p, ["purchasePriceCurrency", "costCurrency"])) suspicious.productsMissingCurrency++;
    if (!isInt(p.costMinor) || !isInt(p.costBaseMinor)) suspicious.productsCostNonInt++;
  }

  return {
    projectId: admin.app().options.projectId || null,
    companyId,
    baseCurrency,
    collectionsDetected: colInfo,
    chosenCollections: { productsCol, salesCol, incomingCol },
    counts: {
      products: products.length,
      sales: sales.length,
      incoming: incoming.length,
    },
    suspicious,
    topSaleOutliers: saleOutliers,
  };
}

export async function deepRepairFinancialsV2({
  companyId,
  apply = false,
  decimals = DEFAULT_DECIMALS,
}) {
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) throw new Error(`Company not found: ${companyId}`);

  const company = companySnap.data() || {};
  const baseCurrency = company.baseCurrency || "USD";

  const colInfo = await detectCollections(companyRef);
  const names = colInfo.all.map(s => String(s));

  const productsCol = names.includes("products") ? "products" : "products";
  const salesCol = names.includes("sales") ? "sales" : "sales";
  const incomingCol = names.includes("incomingProducts") ? "incomingProducts" : "incomingProducts";

  const productsSnap = await companyRef.collection(productsCol).get();
  const salesSnap = await companyRef.collection(salesCol).get();
  const incomingSnap = await companyRef.collection(incomingCol).get().catch(() => ({ docs: [] }));

  const products = productsSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }));
  const sales = salesSnap.docs.map(d => ({ id: d.id, ref: d.ref, data: d.data() || {} }));
  const incoming = (incomingSnap.docs || []).map(d => ({ id: d.id, data: d.data() || {} }));

  // Build incoming by productId
  const incomingByProduct = new Map();
  for (const x of incoming) {
    const pid = x.data.productId;
    if (!pid) continue;
    if (!incomingByProduct.has(pid)) incomingByProduct.set(pid, []);
    incomingByProduct.get(pid).push(x.data);
  }

  // --- Repair products: rebuild costMinor from *major* cost fields or incoming logs ---
  const productCostBase = new Map(); // productId -> { costMinor, costBaseMinor, purchaseCurrency }
  const productPatches = [];

  for (const p of products) {
    const d = p.data;

    const purchaseCurrency = pick(d, ["purchasePriceCurrency", "costCurrency"]) || baseCurrency;
    const logs = incomingByProduct.get(p.id) || [];

    // Weighted avg using incoming logs if we can find qty + unitCost (major preferred)
    let totalQty = 0;
    let totalValueMinor = 0;
    let totalValueBaseMinor = 0;
    let usedLogs = 0;
    let issues = [];

    for (const log of logs) {
      const qty = Math.max(0, Math.trunc(num(pick(log, ["quantity", "qty"]), 0)));
      if (!qty) continue;

      const logCurrency = pick(log, ["currency", "purchaseCurrency"]) || purchaseCurrency;
      const unitMajor = pick(log, ["unitCost", "cost", "purchasePrice"]);
      const unitMinorStored = pick(log, ["unitCostMinor", "costMinor"]);

      // Prefer major if present (this avoids “minor already corrupted” problem)
      let unitMinor;
      if (unitMajor !== undefined && unitMajor !== null && Number.isFinite(Number(unitMajor))) {
        unitMinor = toMinor(Number(unitMajor), logCurrency, decimals);
      } else if (isInt(unitMinorStored)) {
        unitMinor = Number(unitMinorStored);
      } else {
        continue;
      }

      const rate = pick(log, ["fxSnapshot", "fx"])?.rateToBase ?? pick(log, ["rateToBase"]);
      let unitBaseMinor = null;

      if (logCurrency === baseCurrency) {
        unitBaseMinor = unitMinor;
      } else {
        // If FX missing or insane, we refuse to create nonsense base values
        if (rate === undefined || rate === null) {
          issues.push("MISSING_FX_ON_INCOMING");
          unitBaseMinor = null;
        } else if (num(rate, 0) > 10) {
          issues.push("FX_TOO_LARGE_ON_INCOMING");
          unitBaseMinor = null;
        } else {
          unitBaseMinor = convertMinorToBase(unitMinor, rate, logCurrency, baseCurrency, decimals);
        }
      }

      totalQty += qty;
      totalValueMinor += unitMinor * qty;
      if (unitBaseMinor !== null) totalValueBaseMinor += unitBaseMinor * qty;

      usedLogs++;
    }

    let costMinor, costBaseMinor;

    if (totalQty > 0 && usedLogs > 0) {
      costMinor = Math.round(totalValueMinor / totalQty);
      // If we could not compute base for some logs, base is partial; safer to null it
      costBaseMinor = (totalValueBaseMinor > 0) ? Math.round(totalValueBaseMinor / totalQty) : null;
      if (costBaseMinor === null && purchaseCurrency !== baseCurrency) issues.push("CANNOT_REBUILD_COST_BASE");
    } else {
      // Fallback from product major cost fields (again: ignore existing minors)
      const majorCost = num(pick(d, ["cost", "purchasePrice"]), 0);
      costMinor = toMinor(majorCost, purchaseCurrency, decimals);

      const rate = pick(d, ["fxSnapshot", "fx"])?.rateToBase ?? pick(d, ["rateToBase"]);
      if (purchaseCurrency === baseCurrency) costBaseMinor = costMinor;
      else if (rate === undefined || rate === null) {
        costBaseMinor = null;
        issues.push("MISSING_FX_ON_PRODUCT");
      } else if (num(rate, 0) > 10) {
        costBaseMinor = null;
        issues.push("FX_TOO_LARGE_ON_PRODUCT");
      } else {
        costBaseMinor = convertMinorToBase(costMinor, rate, purchaseCurrency, baseCurrency, decimals);
      }
    }

    // sanitize
    if (!isInt(costMinor) || costMinor < 0) costMinor = 0;
    if (costBaseMinor !== null && (!isInt(costBaseMinor) || costBaseMinor < 0)) costBaseMinor = null;

    productCostBase.set(p.id, { purchaseCurrency, costMinor, costBaseMinor });

    // Always patch if different OR corrupted-but-integer (we overwrite regardless to kill scale bugs)
    productPatches.push({
      ref: p.ref,
      patch: {
        purchasePriceCurrency: purchaseCurrency,
        costMinor,
        costBaseMinor, // may be null if FX missing/insane
        repairVersion: "deep-repair-v2",
        repairIssues: issues,
        repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  // --- Repair sales: recompute revenue from salePrice+qty (ignore existing revenueMinor) ---
  const salePatches = [];
  const saleIssuesCount = { missingFx: 0, fxTooLarge: 0, missingProduct: 0, missingPrice: 0 };

  for (const s of sales) {
    const d = s.data;

    const productId = d.productId;
    const qty = Math.max(0, Math.trunc(num(pick(d, ["quantity", "qty"]), 0)));

    const saleCurrency = pick(d, ["salePriceCurrency", "currency"]) || baseCurrency;
    const priceMajor = pick(d, ["salePrice", "price", "unitPrice"]);
    if (!Number.isFinite(Number(priceMajor))) {
      saleIssuesCount.missingPrice++;
      continue;
    }

    const unitPriceMinor = toMinor(Number(priceMajor), saleCurrency, decimals);
    const revenueMinor = unitPriceMinor * qty;

    const rate = pick(d, ["fxSnapshot", "fx"])?.rateToBase ?? pick(d, ["rateToBase"]);
    let revenueBaseMinor = null;

    const issues = [];
    if (saleCurrency === baseCurrency) revenueBaseMinor = revenueMinor;
    else if (rate === undefined || rate === null) {
      saleIssuesCount.missingFx++;
      issues.push("MISSING_FX_ON_SALE");
    } else if (num(rate, 0) > 10) {
      saleIssuesCount.fxTooLarge++;
      issues.push("FX_TOO_LARGE_ON_SALE");
    } else {
      revenueBaseMinor = convertMinorToBase(revenueMinor, rate, saleCurrency, baseCurrency, decimals);
    }

    const productCost = productCostBase.get(productId);

    let cogsBaseMinor = null;
    let grossProfitBaseMinor = null;
    let grossProfitMinor = null;

    if (!productCost) {
      issues.push("MISSING_PRODUCT_FOR_SALE");
    } else if (productCost.costBaseMinor === null || productCost.costBaseMinor === undefined) {
      issues.push("MISSING_PRODUCT_COST_BASE");
    } else if (revenueBaseMinor === null || revenueBaseMinor === undefined) {
      issues.push("MISSING_REVENUE_BASE");
    } else {
      cogsBaseMinor = productCost.costBaseMinor * qty;
      grossProfitBaseMinor = revenueBaseMinor - cogsBaseMinor;

      if (saleCurrency === baseCurrency) {
        grossProfitMinor = grossProfitBaseMinor;
      } else if (rate !== undefined && rate !== null && Number(rate) > 0) {
        const cogsMinor = convertBaseToMinor(cogsBaseMinor, rate, saleCurrency, baseCurrency, decimals);
        if (cogsMinor !== null) grossProfitMinor = revenueMinor - cogsMinor;
      }
    }


    salePatches.push({
      ref: s.ref,
      patch: {
        revenueMinor,
        revenueBaseMinor,
        costOfGoodsSoldBaseMinor: cogsBaseMinor,
        grossProfitBaseMinor,
        grossProfitMinor,
        repairVersion: "deep-repair-v2",
        repairIssues: issues,
        repairedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
    });
  }

  const report = {
    projectId: admin.app().options.projectId || null,
    companyId,
    baseCurrency,
    apply,
    chosenCollections: { productsCol, salesCol, incomingCol },
    totals: {
      products: products.length,
      sales: sales.length,
      productPatches: productPatches.length,
      salePatches: salePatches.length,
    },
    saleIssuesCount,
  };

  if (!apply) return report;

  // Apply in batches
  let batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async () => {
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const x of productPatches) {
    batch.set(x.ref, x.patch, { merge: true });
    ops++;
    await commitIfNeeded();
  }
  for (const x of salePatches) {
    batch.set(x.ref, x.patch, { merge: true });
    ops++;
    await commitIfNeeded();
  }
  if (ops > 0) await batch.commit();

  await db.collection("companies").doc(companyId).collection("repairs").add({
    ...report,
    appliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return report;
}
