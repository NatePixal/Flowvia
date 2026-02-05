
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

// Initialize app
admin.initializeApp();

// Import builders
import { buildStatementWorkbook } from './exports/statement-engine';
import { buildClientStatement } from './exports/builders/client';
import { buildSupplierStatement } from './exports/builders/supplier';
import { buildExpensesStatement } from './exports/builders/expenses';
import { buildProductMovementStatement } from './exports/builders/product';
import { buildStockReportXlsx } from './exports/stockReport';
import { Currency } from './exports/types';

const db = admin.firestore();

function requireAdminOrDev(auth: any) { // req.auth is different in v2
  const role = auth?.token?.role;
  if (!auth || (role !== 'admin' && role !== 'developer')) {
    throw new HttpsError('permission-denied', 'Admin/Developer required.');
  }
}

async function getCompanyBaseCurrency(companyId: string): Promise<Currency> {
  const snap = await db.doc(`companies/${companyId}`).get();
  const base = (snap.data() as any)?.baseCurrency;
  return (base || 'USD') as Currency;
}

function bufferToBase64(buf: Buffer) {
  return buf.toString('base64');
}

// v2 onCall function
export const exportStatement = onCall({ region: 'us-central1', timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
    try {
        requireAdminOrDev(req.auth);

        const { companyId, statementType, targetId, dateFrom, dateTo, locale, stockMode } = req.data || {};
        if (!companyId || !statementType || !dateFrom || !dateTo) {
            throw new HttpsError('invalid-argument', 'Missing companyId/statementType/dateFrom/dateTo.');
        }

        const baseCurrency = await getCompanyBaseCurrency(companyId);
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        
        let buf: Buffer;
        let filename: string;

        if (statementType === 'client') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for client statement.');
            const { summary, rows } = await buildClientStatement({ companyId, clientId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
            filename = `client_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'supplier') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for supplier statement.');
            const { summary, rows } = await buildSupplierStatement({ companyId, supplierId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
            filename = `supplier_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'expenses') {
            const { summary, rows } = await buildExpensesStatement({ companyId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ summary, rows, baseCurrency, locale });
            filename = `expense_statement_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === 'productMovement') {
            if (!targetId) throw new HttpsError('invalid-argument', 'Missing targetId for product statement.');
            const { summary, rows } = await buildProductMovementStatement({ companyId, productId: targetId, from, to, baseCurrency });
            buf = await buildStatementWorkbook({ summary, rows, baseCurrency: summary.baseCurrency, locale });
            filename = `product_statement_${targetId}_${dateFrom}_${dateTo}.xlsx`;
            return { filename, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", base64: bufferToBase64(buf), warnings: summary.warnings };
        }

        if (statementType === "stockReport") {
            // NOTE: This uses placeholder data as requested in the prompt.
            // Replace with real database queries.
            const stockRows = [
              {
                "Product Name": "Sample Product",
                "Current Stock Level": 10,
                "Last Arrival Date": "2026-02-01",
                "Arrival Quantity": 20,
                "Unit Purchase Price": 2.5,
                "Exchange Rate": 1,
                "Total Value": 50,
              },
            ];
        
            const supplierRows = [
              {
                "Date of Transfer": "2026-02-01",
                "Supplier Name": "Supplier A",
                "Product Purchased": "Sample Product",
                "Quantity Bought": 20,
                "Purchase Price (Original Currency)": 2.5,
                "Daily Exchange Rate": 1,
                "Total Paid (Local Currency)": 50,
              },
            ];
        
            const clientRows = [
              {
                "Client Name": "Client X",
                "Purchase Date": "2026-02-02",
                "Product Name": "Sample Product",
                "Quantity Purchased": 5,
                "Unit Sale Price": 3,
                "Exchange Rate (Day of Purchase)": 1,
                "Total Amount Due": 15,
                "Payment Status": "Loan",
              },
            ];

            const companySnap = await db.doc(`companies/${companyId}`).get();
            const companyName = (companySnap.data() as any)?.name || 'FlowVia Business Solutions';
        
            const xlsxBuffer = await buildStockReportXlsx({
              companyName: companyName,
              stockRows,
              supplierRows,
              clientRows,
            });
        
            return {
              base64: xlsxBuffer.toString("base64"),
              filename: `stock-report-${companyId}-${dateFrom}-${dateTo}.xlsx`,
              mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            };
        }
        
        throw new HttpsError('invalid-argument', `Unsupported statementType: ${statementType}`);

    } catch (err: any) {
        console.error('exportStatement failed:', { code: err?.code, message: err?.message, stack: err?.stack });
        if (err instanceof HttpsError) throw err;
        throw new HttpsError('internal', String(err.message || 'Export failed (internal). Check Cloud Functions logs.'), { originalCode: err?.code, originalMessage: String(err?.message || '') });
    }
});
