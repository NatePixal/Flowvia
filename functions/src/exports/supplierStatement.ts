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

  const supplierSnap = await db.collection("suppliers").doc(input.supplierId).get();
  const supplierName = supplierSnap.exists ? (supplierSnap.data()?.name || "Supplier") : "Supplier";

  // Incoming stock purchases
  // Expect: incomingProducts docs: companyId, supplierId, businessDate, qty, unitPrice, total, currency, fxRate, ref
  const incSnap = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("supplierId", "==", input.supplierId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Payments to supplier
  // Expect: supplierPayments docs: companyId, supplierId, businessDate, amount, currency, fxRate, reference
  const paySnap = await db.collection("supplierPayments")
    .where("companyId", "==", input.companyId)
    .where("supplierId", "==", input.supplierId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Opening balance (AP) = purchases - payments before range
  const incBefore = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("supplierId", "==", input.supplierId)
    .where("businessDate", "<", range.from)
    .get();

  const payBefore = await db.collection("supplierPayments")
    .where("companyId", "==", input.companyId)
    .where("supplierId", "==", input.supplierId)
    .where("businessDate", "<", range.from)
    .get();

  const sumIncBefore = incBefore.docs.reduce((a, d) => a + Number(d.data().totalBase ?? d.data().total ?? 0), 0);
  const sumPayBefore = payBefore.docs.reduce((a, d) => a + Number(d.data().amountBase ?? d.data().amount ?? 0), 0);
  let running = sumIncBefore - sumPayBefore; // Amount we owe supplier

  const rows: any[] = [];
  rows.push({
    date: input.from,
    desc: "Opening Balance",
    ref: "-",
    type: "Opening",
    debit: running > 0 ? running : 0,
    credit: running < 0 ? Math.abs(running) : 0,
    running,
    qty: "",
    fx: "",
    cur: "",
  });

  for (const d of incSnap.docs) {
    const x = d.data();
    const total = Number(x.totalBase ?? x.total ?? 0);
    running += total;
    rows.push({
      date: x.businessDate.toDate().toISOString().slice(0, 10),
      desc: x.description || "Stock Purchase",
      ref: x.reference || x.ref || d.id,
      type: "Purchase",
      debit: total,
      credit: 0,
      running,
      qty: Number(x.qty ?? 0),
      fx: x.fxRate ?? x.rate ?? "",
      cur: x.currency ?? "",
    });
  }

  for (const d of paySnap.docs) {
    const p = d.data();
    const amt = Number(p.amountBase ?? p.amount ?? 0);
    running -= amt;
    rows.push({
      date: p.businessDate.toDate().toISOString().slice(0, 10),
      desc: p.description || "Payment Sent",
      ref: p.reference || d.id,
      type: "Payment",
      debit: 0,
      credit: amt,
      running,
      qty: "",
      fx: p.fxRate ?? p.rate ?? "",
      cur: p.currency ?? "",
    });
  }

  // sort (keep opening first)
  const opening = rows.shift();
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const ordered = [opening, ...rows];

  const totalPurchases = ordered.reduce((a, r) => a + (Number(r.debit) || 0), 0) - (opening.debit || 0);
  const totalPayments = ordered.reduce((a, r) => a + (Number(r.credit) || 0), 0) - (opening.credit || 0);
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
  ws.getColumn("F").width = 14;
  ws.getColumn("G").width = 14;
  ws.getColumn("H").width = 16;
  ws.getColumn("I").width = 10;
  ws.getColumn("J").width = 12;
  ws.getColumn("K").width = 10;

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Payable Statement");

  styleInfoRow(ws, 5, "Supplier:", supplierName);
  styleInfoRow(ws, 6, "Currency:", input.currency);
  styleInfoRow(ws, 7, "Period:", `From ${input.from} to ${input.to}`);

  ws.getCell("B9").value = "Opening Balance:";
  ws.getCell("C9").value = money(opening.running);

  ws.getCell("B10").value = "Total Purchases:";
  ws.getCell("C10").value = money(totalPurchases);

  ws.getCell("B11").value = "Total Payments:";
  ws.getCell("C11").value = money(totalPayments);

  ws.getCell("B12").value = "Closing Balance:";
  ws.getCell("C12").value = money(closing);

  ws.getCell("B13").value = "Total Transactions:";
  ws.getCell("C13").value = ordered.length - 1;

  styleSummaryBox(ws);

  const headerRow = 15;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "Debit", "Credit", "Running Balance", "Qty", "FX Rate", "Currency"];
  styleTableHeader(ws, headerRow, 2, 11);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = ["", row.date, row.desc, row.ref, row.type, row.debit || "", row.credit || "", row.running, row.qty, row.fx, row.cur];
    styleTableBodyRow(ws, r, 2, 11);
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    ws.getRow(r).getCell(7).numFmt = "#,##0.00";
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
