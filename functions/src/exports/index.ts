// functions/src/exports/index.ts
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v1/https';
import { randomUUID } from 'crypto';

import { exportClientStatementExcel } from "./clientStatement";
import { exportSupplierStatementExcel } from "./supplierStatement";
import { exportExpenseStatementExcel } from "./expenseStatement";
import { exportProductMovementExcel } from "./productMovement";

if (!admin.apps.length) {
  admin.initializeApp();
}
const bucket = admin.storage().bucket();


async function saveToStorageAndSign(buffer: Buffer, filename: string): Promise<{ url: string, path: string }> {
  const path = `exports/${Date.now()}_${filename}`;
  const file = bucket.file(path);
  const token = randomUUID();

  await file.save(buffer, {
    resumable: false,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    metadata: { 
      cacheControl: "private, max-age=60",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  
  const encodedPath = encodeURIComponent(path);
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
  
  return { url, path };
}

export const exportClientStatement = functions.region("us-central1").https.onCall(async (data, context) => {
  if (!data?.companyId || !data?.clientId || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/clientId/from/to");
  }

  const buf = await exportClientStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `client_statement_${data.clientId}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportSupplierStatement = functions.region("us-central1").https.onCall(async (data, context) => {
  if (!data?.companyId || !data?.supplierId || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/supplierId/from/to");
  }
  const buf = await exportSupplierStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `supplier_statement_${data.supplierId}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportExpenseStatement = functions.region("us-central1").https.onCall(async (data, context) => {
  if (!data?.companyId || !data?.from || !data?.to) {
    throw new HttpsError("invalid-argument", "Missing companyId/from/to");
  }
  const buf = await exportExpenseStatementExcel(data);
  const out = await saveToStorageAndSign(buf, `expenses_${data.from}_${data.to}.xlsx`);
  return { downloadUrl: out.url };
});

export const exportProductStatement = functions.region("us-central1").https.onCall(async (data, context) => {
    if (!data?.companyId || !data?.productId || !data?.from || !data?.to) {
        throw new HttpsError("invalid-argument", "Missing companyId/productId/from/to");
    }
    const buf = await exportProductMovementExcel(data);
    const out = await saveToStorageAndSign(buf, `product_movement_${data.productId}.xlsx`);
    return { downloadUrl: out.url };
});
