
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { exportClientStatementExcel } from "./exports/clientStatement";
import { exportSupplierStatementExcel } from "./exports/supplierStatement";
import { exportExpenseStatementExcel } from "./exports/expenseStatement";
import { exportProductMovementExcel } from "./exports/productMovement";
import { exportStockReportExcel } from "./exports/stockReport";

admin.initializeApp();
setGlobalOptions({ region: "us-central1" });

async function saveToStorageAndSign(buffer: Buffer, filename: string) {
  const bucket = admin.storage().bucket();
  const path = `exports/${Date.now()}_${filename}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    resumable: false,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    metadata: { cacheControl: "private, max-age=60" },
  });

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 15, // 15 minutes
  });

  return { url };
}

export const exportClientStatement = onCall(async (req) => {
  const data = req.data;
  if (!data?.companyId || !data?.clientId || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/clientId/from/to");
  }

  const buf = await exportClientStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `client_statement_${data.clientId}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportSupplierStatement = onCall(async (req) => {
  const data = req.data;
  if (!data?.companyId || !data?.supplierId || !data?.supplierName || !data?.from || !data?.to || !data?.baseCurrency) {
    throw new HttpsError("invalid-argument", "Missing companyId/supplierId/supplierName/from/to/baseCurrency");
  }
  const buf = await exportSupplierStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `supplier_statement_${data.supplierId}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportExpenseStatement = onCall(async (req) => {
  const data = req.data;
  if (!data?.companyId || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/from/to");
  }
  const buf = await exportExpenseStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `expenses_${data.from}_${data.to}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportProductStatement = onCall(async (req) => {
  const data = req.data;
  if (!data?.companyId || !data?.productCode || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/productCode/from/to");
  }
  const buf = await exportProductMovementExcel(data);
  const out = await saveToStorageAndSign(buf, `product_movement_${data.productCode}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportStockReport = onCall(async (req) => {
  const d = req.data;
  if (!d?.companyId || !d?.from || !d?.to || !d?.baseCurrency || !d?.stockMode) {
    throw new HttpsError("invalid-argument", "Missing companyId/from/to/baseCurrency/stockMode");
  }
  const buf = await exportStockReportExcel(d);
  const out = await saveToStorageAndSign(buf, `stock_${d.stockMode}_${d.from}_${d.to}.xlsx`);
  return { downloadUrl: out.url };
});
