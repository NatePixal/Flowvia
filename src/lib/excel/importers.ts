import {
  collection,
  doc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  Firestore,
} from "firebase/firestore";
import { companyCollection, companyDoc } from "@/lib/firestore-path";
import { readFirstSheetRows, requireColumns, parseDateLoose, parseLooseNumber } from "@/lib/excel/xlsx-io";
import { Currency, ClientLedgerEntry, DailyExpense, Product } from "@/lib/types";
import { toMinor, clampNonNegative } from "@/lib/money";

const ALLOWED_CURRENCIES: Currency[] = ["USD", "UZS", "AED", "CNY"];

function assertCurrency(v: any): Currency {
  const c = String(v || "").trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.includes(c as Currency)) {
    throw new Error(`Invalid currency "${v}". Allowed: ${ALLOWED_CURRENCIES.join(", ")}`);
  }
  return c as Currency;
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** PRODUCTS: upsert products by productCode (doc id) */
export async function importProductsXlsx(db: Firestore, companyId: string, file: File) {
  const rows = await readFirstSheetRows(file);
  requireColumns(rows, ["productCode", "name"]);

  const writes = rows.map((r, idx) => {
    const productCode = String(r.productCode || "").trim();
    const name = String(r.name || "").trim();
    if (!productCode) throw new Error(`Row ${idx + 2}: productCode is required`);
    if (!name) throw new Error(`Row ${idx + 2}: name is required`);

    const quantity = parseLooseNumber(r.quantity);
    const cost = parseLooseNumber(r.cost);
    const minStock = parseLooseNumber(r.minStock);
    const sellingPrice = parseLooseNumber(r.sellingPrice);

    // IMPORTANT: prevent NaN (this avoids rules rejecting "NaN" and avoids silent corruption)
    if (r.cost !== "" && cost === null) throw new Error(`Row ${idx + 2}: cost is not a valid number`);
    if (r.quantity !== "" && quantity === null) throw new Error(`Row ${idx + 2}: quantity is not a valid number`);

    const priceCurrency = r.priceCurrency ? assertCurrency(r.priceCurrency) : undefined;

    return {
      docId: productCode,
      data: {
        companyId,
        productCode,
        name,
        category: String(r.category || ""),
        quantity: quantity !== null ? Math.trunc(quantity) : 0,
        cost: cost !== null ? cost : 0,
        supplier: String(r.supplier || ""),
        location: String(r.location || ""),
        minStock: minStock !== null ? Math.trunc(minStock) : 0,
        ...(sellingPrice !== null ? { sellingPrice } : {}),
        ...(priceCurrency ? { sellingPriceCurrency: priceCurrency, purchasePriceCurrency: priceCurrency } : {}),
        updatedAt: serverTimestamp(),
      },
    };
  });

  for (const part of chunk(writes, 400)) {
    const batch = writeBatch(db);
    for (const w of part) {
      const ref = doc(companyCollection(db, companyId, "products"), w.docId);
      batch.set(ref, w.data, { merge: true });
    }
    await batch.commit();
  }
}

/** EXPENSES: append docs to companies/{companyId}/dailyExpenses */
export async function importExpensesXlsx(db: Firestore, companyId: string, file: File) {
  const rows = await readFirstSheetRows(file);
  requireColumns(rows, ["date", "expenseType", "amount", "currency"]);

  const writes = rows.map((r, idx) => {
    const date = parseDateLoose(r.date);
    if (!date) throw new Error(`Row ${idx + 2}: invalid date`);

    const amount = parseLooseNumber(r.amount);
    if (amount === null) throw new Error(`Row ${idx + 2}: amount is not a valid number`);

    const currency = assertCurrency(r.currency);

    const expense: Partial<DailyExpense> & Record<string, any> = {
      companyId,
      date: Timestamp.fromDate(date),
      expenseType: String(r.expenseType || "").trim() as DailyExpense['expenseType'],
      description: String(r.description || ""),
      amount, // stored as MAJOR units in your current model
      currency,
      createdAt: serverTimestamp(),
    };

    // keep your existing salary link fields if present
    if (r.employee_id) expense.employee_id = String(r.employee_id);
    if (r.paid_to_seller_id) expense.paid_to_seller_id = String(r.paid_to_seller_id);

    if (!expense.expenseType) throw new Error(`Row ${idx + 2}: expenseType is required`);

    return expense;
  });

  for (const part of chunk(writes, 400)) {
    const batch = writeBatch(db);
    for (const w of part) {
      const ref = doc(companyCollection(db, companyId, "dailyExpenses"));
      batch.set(ref, w, { merge: false });
    }
    await batch.commit();
  }
}

/**
 * CLIENT LOANS: Import a per-client ledger file.
 * We apply FIFO locally so:
 * - purchases get correct paidMinor/dueMinor
 * - payment entries are still stored (so you can show “transactions” to the client)
 * - client.outstandingByCurrency updates correctly
 */
export async function importClientLedgerXlsx(
  db: Firestore,
  companyId: string,
  clientId: string,
  file: File
) {
  const rows = await readFirstSheetRows(file);
  requireColumns(rows, ["date", "entryType", "currency", "amount"]);

  type Row = { date: Date; entryType: "purchase" | "payment"; currency: Currency; amountMinor: number; note?: string };

  const parsed: Row[] = rows.map((r, idx) => {
    const date = parseDateLoose(r.date);
    if (!date) throw new Error(`Row ${idx + 2}: invalid date`);

    const entryType = String(r.entryType || "").trim().toLowerCase();
    if (entryType !== "purchase" && entryType !== "payment") {
      throw new Error(`Row ${idx + 2}: entryType must be "purchase" or "payment"`);
    }

    const currency = assertCurrency(r.currency);
    const amountMajor = parseLooseNumber(r.amount);
    if (amountMajor === null) throw new Error(`Row ${idx + 2}: amount is not a valid number`);

    const amountMinor = toMinor(amountMajor, currency);
    if (amountMinor <= 0) throw new Error(`Row ${idx + 2}: amount must be > 0`);

    return { date, entryType: entryType as any, currency, amountMinor, note: String(r.note || "") };
  });

  // group by currency
  const byCur = new Map<Currency, Row[]>();
  for (const r of parsed) {
    byCur.set(r.currency, [...(byCur.get(r.currency) || []), r]);
  }

  const ledgerBase = `clients/${clientId}/ledger`;
  const ledgerCol = companyCollection(db, companyId, ledgerBase);

  const outstandingByCurrency: Record<string, number> = {};
  let openPurchasesCount = 0;

  // We will write everything with correct Timestamp from the Excel date.
  // FIFO apply within each currency by chronological order.
  const allWrites: { refPath: string; data: any }[] = [];

  for (const [currency, items] of byCur.entries()) {
    const sorted = [...items].sort((a, b) => a.date.getTime() - b.date.getTime());

    const purchases: {
      totalMinor: number;
      paidMinor: number;
      dueMinor: number;
      createdAt: Timestamp;
      note?: string;
    }[] = [];

    // Create entries
    for (const it of sorted) {
      if (it.entryType === "purchase") {
        purchases.push({
          totalMinor: it.amountMinor,
          paidMinor: 0,
          dueMinor: it.amountMinor,
          createdAt: Timestamp.fromDate(it.date),
          note: it.note || "",
        });
      } else {
        // payment: apply FIFO to purchases
        let remaining = it.amountMinor;
        for (const p of purchases) {
          if (remaining <= 0) break;
          if (p.dueMinor <= 0) continue;
          const apply = Math.min(remaining, p.dueMinor);
          p.paidMinor += apply;
          p.dueMinor -= apply;
          remaining -= apply;
        }

        // Always store the payment entry as a transaction record
        allWrites.push({
          refPath: ledgerBase,
          data: {
            companyId,
            clientId,
            type: "payment",
            currency,
            totalMinor: it.amountMinor,
            paidMinor: it.amountMinor,
            dueMinor: 0,
            paymentMinor: it.amountMinor,
            note: it.note || "Client Payment",
            createdAt: Timestamp.fromDate(it.date),
          } satisfies Partial<ClientLedgerEntry>,
        });

        // If remaining > 0, this means they paid more than outstanding so far (credit).
        // Your model does not formally support credit; we keep the payment entry and leave outstanding at 0.
      }
    }

    // Write purchase entries AFTER we applied all payments
    for (const p of purchases) {
      const dueMinor = clampNonNegative(p.dueMinor);
      if (dueMinor > 0) {
        outstandingByCurrency[currency] = (outstandingByCurrency[currency] || 0) + dueMinor;
        openPurchasesCount++;
      }

      allWrites.push({
        refPath: ledgerBase,
        data: {
          companyId,
          clientId,
          type: "purchase",
          currency,
          totalMinor: p.totalMinor,
          paidMinor: p.paidMinor,
          dueMinor,
          note: p.note || "Client Purchase",
          createdAt: p.createdAt,
        } satisfies Partial<ClientLedgerEntry>,
      });
    }
  }

  // Commit ledger + client summary in chunks
  const clientRef = companyDoc(db, companyId, `clients/${clientId}`);
  const writeChunks = chunk(allWrites, 350);

  for (const part of writeChunks) {
    const batch = writeBatch(db);
    for (const w of part) {
      const ref = doc(companyCollection(db, companyId, w.refPath));
      batch.set(ref, w.data, { merge: false });
    }
    batch.set(
      clientRef,
      {
        outstandingByCurrency,
        openPurchasesCount,
        lastActivityAt: serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();
  }
}

/**
 * EMPLOYEE SALARY IMPORT:
 * We store salary payments as DailyExpense rows (expenseType="salary"),
 * linked by employee_id if present (recommended).
 */
export async function importEmployeeSalaryXlsx(
  db: Firestore,
  companyId: string,
  file: File,
  resolveEmployeeIdByName?: (name: string) => string | null
) {
  const rows = await readFirstSheetRows(file);
  requireColumns(rows, ["date", "amount", "currency"]);

  const writes = rows.map((r, idx) => {
    const date = parseDateLoose(r.date);
    if (!date) throw new Error(`Row ${idx + 2}: invalid date`);

    const amount = parseLooseNumber(r.amount);
    if (amount === null) throw new Error(`Row ${idx + 2}: amount is not a valid number`);

    const currency = assertCurrency(r.currency);

    let employee_id = r.employee_id ? String(r.employee_id) : "";
    const employee_name = r.employee_name ? String(r.employee_name).trim() : "";

    if (!employee_id && employee_name && resolveEmployeeIdByName) {
      employee_id = resolveEmployeeIdByName(employee_name) || "";
    }

    if (!employee_id) {
      throw new Error(
        `Row ${idx + 2}: missing employee_id (or employee_name could not be resolved)`
      );
    }

    return {
      companyId,
      date: Timestamp.fromDate(date),
      expenseType: "salary",
      description: String(r.note || "Salary"),
      amount,
      currency,
      employee_id,
      createdAt: serverTimestamp(),
    };
  });

  for (const part of chunk(writes, 400)) {
    const batch = writeBatch(db);
    for (const w of part) {
      const ref = doc(companyCollection(db, companyId, "dailyExpenses"));
      batch.set(ref, w, { merge: false });
    }
    await batch.commit();
  }
}
