import * as admin from "firebase-admin";
import ExcelJS from "exceljs";
import {
  applyGlobalWorkbookStyle,
  makeDateRange,
  money,
  setSheetPrintDefaults,
  styleInfoRow,
  styleSummaryBox,
  styleTableBodyRow,
  styleTableHeader,
  styleTitle,
} from "./exportUtils";
import { SupplierLedgerEntry } from "../types";

type ExportSupplierInput = {
  companyId: string;
  supplierId: string;
  currency: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

export async function exportSupplierStatementExcel(input: ExportSupplierInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  const supplierSnap = await db.doc(`companies/${input.companyId}/suppliers/${input.supplierId}`).get();
  const supplierName = supplierSnap.exists ? (supplierSnap.data()?.name || "Supplier") : "Supplier";

  const ledgerRef = db.collection(`companies/${input.companyId}/suppliers/${input.supplierId}/ledger`);

  // CORRECTED: Use 'date' which exists on the ledger types
  const ledgerBeforeSnap = await ledgerRef.where("date", "<", range.from).get();
  const ledgerRangeSnap = await ledgerRef
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  let openingBalance = 0;
  ledgerBeforeSnap.forEach(d => {
    const entry = d.data() as SupplierLedgerEntry;
    if (entry.currency !== input.currency) return;
    if (entry.type === 'purchase') openingBalance += entry.purchaseDueMinor ?? 0;
    if (entry.type === 'payment') openingBalance -= entry.paymentMinor ?? 0;
  });

  let running = openingBalance; // Amount we owe supplier

  const rows: any[] = [];
  rows.push({
    date: range.from.toDate(),
    desc: "Opening Balance",
    ref: "-",
    type: "Opening",
    debit: 0, // In AP, debit means payment sent (reduces what we owe)
    credit: running, // Credit means purchase (increases what we owe)
    running,
  });

  for (const d of ledgerRangeSnap.docs) {
    const entry = d.data() as SupplierLedgerEntry;
    if(entry.currency !== input.currency) continue;

    if (entry.type === 'purchase') {
      const total = entry.purchaseTotalMinor ?? 0;
      running += total;
      rows.push({
        date: entry.date.toDate(),
        desc: entry.note || "Stock Purchase",
        ref: d.id,
        type: "Purchase",
        debit: 0,
        credit: total,
        running,
      });
    } else if (entry.type === 'payment') {
      const amt = entry.paymentMinor ?? 0;
      running -= amt;
      rows.push({
        date: entry.date.toDate(),
        desc: entry.note || "Payment Sent",
        ref: d.id,
        type: "Payment",
        debit: amt,
        credit: 0,
        running,
      });
    }
  }

  const opening = rows.shift();
  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const ordered = [opening, ...rows];

  const totalPurchases = ordered.reduce((a, r) => a + (Number(r.credit) || 0), 0) - (opening.credit || 0);
  const totalPayments = ordered.reduce((a, r) => a + (Number(r.debit) || 0), 0) - (opening.debit || 0);
  const closing = ordered[ordered.length - 1]?.running ?? opening.running;

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Supplier Statement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 18;
  ws.getColumn("C").width = 32;
  ws.getColumn("D").width = 16;
  ws.getColumn("E").width = 12;
  ws.getColumn("F").width = 14; // Debit
  ws.getColumn("G").width = 14; // Credit
  ws.getColumn("H").width = 16;

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Payable Statement");

  styleInfoRow(ws, 5, "Supplier:", supplierName);
  styleInfoRow(ws, 6, "Currency:", input.currency);
  styleInfoRow(ws, 7, "Period:", `From ${input.from} to ${input.to}`);

  ws.getCell("B9").value = opening.running;
  ws.getCell("B10").value = totalPurchases;
  ws.getCell("B11").value = totalPayments;
  ws.getCell("B12").value = closing;
  ws.getCell("C9").value = "Opening Balance:";
  ws.getCell("C10").value = "Total Purchases (Credit):";
  ws.getCell("C11").value = "Total Payments (Debit):";
  ws.getCell("C12").value = "Closing Balance:";

  styleSummaryBox(ws);

  const headerRow = 15;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "Debit", "Credit", "Running Balance"];
  styleTableHeader(ws, headerRow, 2, 8);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = ["", row.date, row.desc, row.ref, row.type, row.debit || "", row.credit || "", row.running];
    styleTableBodyRow(ws, r, 2, 8);
    ws.getRow(r).getCell(2).numFmt = 'yyyy-mm-dd';
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    ws.getRow(r).getCell(7).numFmt = "#,##0.00";
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
