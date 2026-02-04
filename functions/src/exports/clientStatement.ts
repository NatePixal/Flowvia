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

type ExportClientInput = {
  companyId: string;
  clientId: string;
  currency: string; // e.g. USD
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
};

type ClientTxRow = {
  businessDate: admin.firestore.Timestamp;
  description: string;
  reference: string;
  type: "Purchase" | "Payment" | "Opening";
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
  const clientSnap = await db.collection("clients").doc(input.clientId).get();
  const clientName = clientSnap.exists ? (clientSnap.data()?.name || "Client") : "Client";

  // --- SALES (client purchases) ---
  // Expect: sales docs contain: companyId, clientId, businessDate, items[{productId, qty, unitPrice}], total, currency, fxRate, invoiceNo
  const salesSnap = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // --- PAYMENTS (client payments received) ---
  // Expect: clientPayments docs: companyId, clientId, businessDate, amount, currency, fxRate, reference
  const paySnap = await db.collection("clientPayments")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Opening balance = sum(sales - payments) before range.from
  const salesBefore = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("businessDate", "<", range.from)
    .get();

  const paysBefore = await db.collection("clientPayments")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("businessDate", "<", range.from)
    .get();

  const sumSalesBefore = salesBefore.docs.reduce((a, d) => a + (Number(d.data().totalBase ?? d.data().total ?? 0)), 0);
  const sumPaysBefore = paysBefore.docs.reduce((a, d) => a + (Number(d.data().amountBase ?? d.data().amount ?? 0)), 0);
  let running = sumSalesBefore - sumPaysBefore;

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

  // Convert sales into statement rows (Debit)
  for (const d of salesSnap.docs) {
    const s = d.data();
    const total = Number(s.totalBase ?? s.total ?? 0);
    const totalQty = Array.isArray(s.items) ? s.items.reduce((a: number, it: any) => a + Number(it.qty ?? 0), 0) : undefined;

    running += total;
    rows.push({
      businessDate: s.businessDate,
      description: s.description || "Product Sale",
      reference: s.invoiceNo || d.id,
      type: "Purchase",
      debit: total,
      credit: 0,
      running,
      qty: totalQty,
      unitPrice: undefined,
      fxRate: s.fxRate ?? s.rate ?? undefined,
      saleCurrency: s.currency ?? undefined,
    });
  }

  // Convert payments into statement rows (Credit)
  for (const d of paySnap.docs) {
    const p = d.data();
    const amt = Number(p.amountBase ?? p.amount ?? 0);
    running -= amt;
    rows.push({
      businessDate: p.businessDate,
      description: p.description || "Payment Received",
      reference: p.reference || d.id,
      type: "Payment",
      debit: 0,
      credit: amt,
      running,
      fxRate: p.fxRate ?? p.rate ?? undefined,
      saleCurrency: p.currency ?? undefined,
    });
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
  ws.getColumn("I").width = 10; // Qty
  ws.getColumn("J").width = 12; // FX
  ws.getColumn("K").width = 10; // Curr

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Receivable Statement");

  styleInfoRow(ws, 5, "Client:", clientName);
  styleInfoRow(ws, 6, "Currency:", input.currency);
  styleInfoRow(ws, 7, "Period:", `From ${input.from} to ${input.to}`);

  // Summary box (B9:C13)
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

  // Table header
  const headerRow = 15;
  ws.getRow(headerRow).values = [
    "",
    "Date",
    "Description",
    "Reference",
    "Type",
    "Debit",
    "Credit",
    "Running Balance",
    "Qty",
    "FX Rate",
    "Currency",
  ];
  styleTableHeader(ws, headerRow, 2, 11);

  // Body
  let r = headerRow + 1;
  for (const row of ordered) {
    const dt = row.type === "Opening" ? new Date(input.from + "T00:00:00Z") : row.businessDate.toDate();
    ws.getRow(r).values = [
      "",
      dt.toISOString().slice(0, 10),
      row.description,
      row.reference,
      row.type,
      row.debit || "",
      row.credit || "",
      row.running,
      row.qty ?? "",
      row.fxRate ?? "",
      row.saleCurrency ?? "",
    ];
    styleTableBodyRow(ws, r, 2, 11);
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    ws.getRow(r).getCell(7).numFmt = "#,##0.00";
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  // Totals
  ws.getRow(r).values = ["", "Total:", "", "", "", totalPurchases, totalPayments, closing, "", "", ""];
  styleTableBodyRow(ws, r, 2, 11);
  ws.getRow(r).getCell(2).font = { bold: true };
  ws.getRow(r).getCell(6).font = { bold: true };
  ws.getRow(r).getCell(7).font = { bold: true };
  ws.getRow(r).getCell(8).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
