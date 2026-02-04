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
import { ClientLedgerEntry } from "../types";

type ExportClientInput = {
  companyId: string;
  clientId: string;
  currency: string; // e.g. USD
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
  locale?: string;
};

type ClientTxRow = {
  businessDate: admin.firestore.Timestamp;
  description: string;
  reference: string;
  type: "Purchase" | "Payment" | "Opening" | "Adjustment";
  debit: number;   // increases AR
  credit: number;  // decreases AR
  running: number;
  qty?: number;
  unitPrice?: number;
  fxRate?: number;
  saleCurrency?: string;
};

export async function exportClientStatementExcel(input: ExportClientInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // Client name
  const clientSnap = await db.doc(`companies/${input.companyId}/clients/${input.clientId}`).get();
  const clientName = clientSnap.exists ? (clientSnap.data()?.name || "Client") : "Client";

  const ledgerRef = db.collection(`companies/${input.companyId}/clients/${input.clientId}/ledger`);

  const ledgerBeforeSnap = await ledgerRef.where("date", "<", range.from).get();
  const ledgerRangeSnap = await ledgerRef
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  let openingBalance = 0;
  ledgerBeforeSnap.docs.forEach(d => {
      const entry = d.data() as ClientLedgerEntry;
      if (entry.currency !== input.currency) return; // Simple filter for now
      if(entry.type === 'purchase') openingBalance += entry.dueMinor ?? 0;
      if(entry.type === 'payment') openingBalance -= entry.paymentMinor ?? 0;
  });

  let running = openingBalance;

  const rows: ClientTxRow[] = [];
  rows.push({
    businessDate: range.from,
    description: "Opening Balance",
    reference: "-",
    type: "Opening",
    debit: running > 0 ? running : 0,
    credit: running < 0 ? Math.abs(running) : 0,
    running,
  });
  
  for (const doc of ledgerRangeSnap.docs) {
      const entry = doc.data() as ClientLedgerEntry;
      if (entry.currency !== input.currency) continue;

      if (entry.type === 'purchase') {
          const total = entry.totalMinor ?? 0;
          running += total;
          rows.push({
            businessDate: entry.date as admin.firestore.Timestamp,
            description: entry.note || "Product Sale",
            reference: entry.relatedSaleId || doc.id,
            type: "Purchase",
            debit: total,
            credit: 0,
            running,
          });
      } else if (entry.type === 'payment') {
          const amt = entry.paymentMinor ?? 0;
          running -= amt;
           rows.push({
            businessDate: entry.date as admin.firestore.Timestamp,
            description: entry.note || "Payment Received",
            reference: doc.id,
            type: "Payment",
            debit: 0,
            credit: amt,
            running,
          });
      }
  }


  // Re-sort combined rows by date (opening first)
  const opening = rows.shift()!;
  rows.sort((a, b) => a.businessDate.toMillis() - b.businessDate.toMillis());
  const ordered = [opening, ...rows];

  const totalPurchases = ordered.reduce((a, r) => a + r.debit, 0) - opening.debit;
  const totalPayments = ordered.reduce((a, r) => a + r.credit, 0) - opening.credit;
  const closing = ordered[ordered.length - 1]?.running ?? opening.running;

  // --- EXCEL ---
  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Client Statement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 18; // Date
  ws.getColumn("C").width = 32; // Desc
  ws.getColumn("D").width = 16; // Ref
  ws.getColumn("E").width = 12; // Type
  ws.getColumn("F").width = 14; // Debit
  ws.getColumn("G").width = 14; // Credit
  ws.getColumn("H").width = 16; // Running

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Receivable Statement");

  styleInfoRow(ws, 5, "Client:", clientName);
  styleInfoRow(ws, 6, "Currency:", input.currency);
  styleInfoRow(ws, 7, "Period:", `From ${input.from} to ${input.to}`);

  // Summary box (B9:C13)
  ws.getCell("B9").value = opening.running;
  ws.getCell("B10").value = totalPurchases;
  ws.getCell("B11").value = totalPayments;
  ws.getCell("B12").value = closing;
  ws.getCell("C9").value = "Opening Balance:";
  ws.getCell("C10").value = "Total Purchases:";
  ws.getCell("C11").value = "Total Payments:";
  ws.getCell("C12").value = "Closing Balance:";

  styleSummaryBox(ws);

  // Table header
  const headerRow = 15;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "Debit", "Credit", "Running Balance"];
  styleTableHeader(ws, headerRow, 2, 8);

  // Body
  let r = headerRow + 1;
  for (const row of ordered) {
    const dt = row.type === "Opening" ? new Date(input.from + "T00:00:00Z") : row.businessDate.toDate();
    ws.getRow(r).values = ["", dt, row.description, row.reference, row.type, row.debit || "", row.credit || "", row.running];
    styleTableBodyRow(ws, r, 2, 8);
    ws.getRow(r).getCell(2).numFmt = 'yyyy-mm-dd';
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    ws.getRow(r).getCell(7).numFmt = "#,##0.00";
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  // Totals
  ws.getRow(r).values = ["", "Total:", "", "", "", totalPurchases, totalPayments, closing];
  styleTableBodyRow(ws, r, 2, 8);
  ws.getRow(r).getCell(2).font = { bold: true };
  ws.getRow(r).getCell(6).font = { bold: true };
  ws.getRow(r).getCell(7).font = { bold: true };
  ws.getRow(r).getCell(8).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
