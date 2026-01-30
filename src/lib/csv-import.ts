
'use client';

import { doc, runTransaction, collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import type { Product, IncomingProductLog } from '@/lib/types';
import * as XLSX from 'xlsx';

// 1. Universal Parser
function parseFile(file: File): Promise<any[]> {
  return new Promise<any[]>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 2. Data Validation
function validateRow(row: any): boolean {
  const quantity = Number(row.quantity);
  const unitCost = Number(row.unitCost);
  return (
    row.productCode &&
    row.supplier &&
    row.quantity && !isNaN(quantity) && quantity > 0 &&
    row.unitCost && !isNaN(unitCost) && unitCost >= 0
  );
}


// 3. Batch Write to Firestore
async function writeDataToFirestore(db: Firestore, companyId: string, rows: any[]) {
    
    for (const row of rows) {
        const productCode = String(row.productCode).toUpperCase().trim();
        if (!productCode) continue;

        const productRef = doc(db, "products", productCode);

        // We still use a transaction for the critical stock & cost update part
        await runTransaction(db, async (transaction) => {
            const productSnap = await transaction.get(productRef);

            if (!productSnap.exists()) {
                const newStock = row.quantity;
                const newProduct: Omit<Product, 'id'> = {
                    productCode: productCode,
                    companyId: companyId,
                    name: row.productName || `Product ${productCode}`,
                    category: row.category || 'Uncategorized',
                    quantity: newStock,
                    cost: row.unitCost,
                    supplier: row.supplier || '',
                    warehouseLocation: row.location || '',
                    minStock: row.minStock || 0,
                    lowStock: newStock <= (row.minStock || 0),
                    createdAt: serverTimestamp() as any,
                    updatedAt: serverTimestamp() as any,
                    sellingPrice: 0,
                    purchasePrice: row.unitCost,
                    purchasePriceCurrency: 'USD',
                    sellingPriceCurrency: 'USD',
                };
                transaction.set(productRef, newProduct);
            } else {
                const existingData = productSnap.data() as Product;
                const oldStock = existingData.quantity || 0;
                const oldAvgCost = existingData.cost || 0;
                const minStock = existingData.minStock || 0;
                const newStock = oldStock + row.quantity;
                const newAvgCost = newStock > 0 ? (oldStock * oldAvgCost + row.quantity * row.unitCost) / newStock : 0;

                transaction.update(productRef, {
                    quantity: newStock,
                    cost: newAvgCost,
                    supplier: row.supplier,
                    lowStock: newStock <= minStock,
                    updatedAt: serverTimestamp(),
                });
            }
        });

        // These can be added outside the transaction for better performance if atomicity isn't required for logs
        await addDoc(collection(db, "incomingProducts"), {
             productCode: productCode,
             companyId: companyId,
             quantity: row.quantity,
             unitCost: row.unitCost,
             totalCost: row.quantity * row.unitCost,
             date: serverTimestamp(),
             supplier: row.supplier,
         } as Omit<IncomingProductLog, 'id'>);

         await addDoc(collection(db, "inventoryLogs"), {
             productId: productCode,
             productCode: productCode,
             companyId: companyId,
             changeQuantity: row.quantity,
             changeDate: serverTimestamp(),
             reason: `Stock import from file. Supplier: ${row.supplier || 'N/A'}.`,
         });
    }
}


// 4. Main Exported Handler Function
export async function importIncomingProducts(file: File, db: Firestore, companyId: string) {
    // Step 1: Parse the file
    const parsedRows = await parseFile(file);

    // Step 2: Validate the rows
    const validRows = parsedRows.filter(validateRow);
    if (validRows.length === 0) {
        throw new Error("No valid rows with productCode, supplier, quantity, and unitCost found in the file.");
    }
    if (validRows.length !== parsedRows.length) {
        console.warn(`Skipped ${parsedRows.length - validRows.length} invalid rows.`);
    }

    // Step 3: Enrich the data
    const finalData = validRows.map(row => ({
        ...row,
        productCode: String(row.productCode).toUpperCase().trim(),
        quantity: Number(row.quantity),
        unitCost: Number(row.unitCost),
    }));

    // Step 4: Write to Firestore
    await writeDataToFirestore(db, companyId, finalData);
}

    
