import * as admin from "firebase-admin";
import ExcelJS from "exceljs";
import {
  applyGlobalWorkbookStyle,
  makeDateRange,
  moneyFromMinor,
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
  baseCurrency: string; // e.g. USD
  from: string;     // YYYY-MM-DD
  to: string;       // YYYY-MM-DD
};

type Row = {
  dateISO: string;
  description: string;
  reference: string;
  type: "Opening" | "Purchase" | "Payment";
  debitBaseMinor: number;   // increases AR
  creditBaseMinor: number;  // decreases AR
  runningBaseMinor: number;

  qty?: number;
  unitPrice?: number;
  currency?: string;
  fxRate?: number;
};

function extractFxRate(fx: any): number | undefined {
  // your fx object: { rateToBase, enteredRate, ... }
  return fx?.enteredRate ?? fx?.rateToBase ?? undefined;
}

export async function exportClientStatementExcel(input: ExportClientInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // Client doc (if you have top-level clients collection, else skip)
  let clientName = "Client";
  try {
    const clientSnap = await db.collection("clients").doc(input.clientId).get();
    if (clientSnap.exists) clientName = clientSnap.data()?.name || clientName;
  } catch {
    // ignore if you don't have top-level clients
  }

  // SALES within range: use 'date'
  const salesSnap = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  // CLIENT PAYMENTS: subcollection ledger
  const ledgerRef = db.collection("companies").doc(input.companyId)
    .collection("clients").doc(input.clientId)
    .collection("ledger");

  const paySnap = await ledgerRef
    .where("type", "==", "payment")
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Opening balance = sum(sales revenueBaseMinor) - sum(payments in base minor) before range
  const salesBefore = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("clientId", "==", input.clientId)
    .where("date", "<", range.from)
    .get();

  const paysBefore = await ledgerRef
    .where("type", "==", "payment")
    .where("businessDate", "<", range.from)
    .get();

  const sumSalesBefore = salesBefore.docs.reduce((a, d) => a + Number(d.data().revenueBaseMinor ?? 0), 0);
  const sumPaysBefore = paysBefore.docs.reduce((a, d) => a + Number(d.data().paymentMinor ?? 0), 0);
  let running = sumSalesBefore - sumPaysBefore;

  const rows: Row[] = [];
  rows.push({
    dateISO: input.from,
    description: "Opening Balance",
    reference: "-",
    type: "Opening",
    debitBaseMinor: running > 0 ? running : 0,
    creditBaseMinor: running < 0 ? Math.abs(running) : 0,
    runningBaseMinor: running,
  });

  // Purchases (sales)
  for (const d of salesSnap.docs) {
    const s = d.data();
    const revenueBaseMinor = Number(s.revenueBaseMinor ?? 0);

    running += revenueBaseMinor;
    rows.push({
      dateISO: s.date?.toDate().toISOString().slice(0, 10),
      description: s.productName ? `Sale - ${s.productName}` : "Product Sale",
      reference: s.id ?? d.id,
      type: "Purchase",
      debitBaseMinor: revenueBaseMinor,
      creditBaseMinor: 0,
      runningBaseMinor: running,

      qty: Number(s.quantity ?? 0),
      unitPrice: Number(s.salePrice ?? 0),
      currency: s.salePriceCurrency ?? s.baseCurrency ?? "",
      fxRate: extractFxRate(s.fx),
    });
  }

  // Payments
  for (const d of paySnap.docs) {
    const p = d.data();
    const paymentMinor = Number(p.paymentMinor ?? 0);

    running -= paymentMinor;
    rows.push({
      dateISO: p.businessDate?.toDate().toISOString().slice(0, 10),
      description: p.note || "Payment Received",
      reference: d.id,
      type: "Payment",
      debitBaseMinor: 0,
      creditBaseMinor: paymentMinor,
      runningBaseMinor: running,

      currency: p.currency ?? "",
      fxRate: extractFxRate(p.fx),
    });
  }

  // Ensure sorted by date except opening first
  const opening = rows.shift()!;
  rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ordered = [opening, ...rows];

  const totalPurchases = ordered.reduce((a, r) => a + r.debitBaseMinor, 0) - opening.debitBaseMinor;
  const totalPayments = ordered.reduce((a, r) => a + r.creditBaseMinor, 0) - opening.creditBaseMinor;
  const closing = ordered[ordered.length - 1]?.runningBaseMinor ?? opening.runningBaseMinor;

  // --- Excel ---
  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Client Statement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 14;
  ws.getColumn("C").width = 34;
  ws.getColumn("D").width = 16;
  ws.getColumn("E").width = 10;
  ws.getColumn("F").width = 14;
  ws.getColumn("G").width = 14;
  ws.getColumn("H").width = 16;
  ws.getColumn("I").width = 8;   // qty
  ws.getColumn("J").width = 12;  // unit price
  ws.getColumn("K").width = 10;  // currency
  ws.getColumn("L").width = 10;  // fx

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Receivable Statement");
  styleInfoRow(ws, 5, "Client:", clientName);
  styleInfoRow(ws, 6, "Base Currency:", input.baseCurrency);
  styleInfoRow(ws, 7, "Period:", `From ${input.from} to ${input.to}`);

  ws.getCell("B9").value = "Opening Balance:";
  ws.getCell("C9").value = moneyFromMinor(opening.runningBaseMinor);

  ws.getCell("B10").value = "Total Purchases:";
  ws.getCell("C10").value = moneyFromMinor(totalPurchases);

  ws.getCell("B11").value = "Total Payments:";
  ws.getCell("C11").value = moneyFromMinor(totalPayments);

  ws.getCell("B12").value = "Closing Balance:";
  ws.getCell("C12").value = moneyFromMinor(closing);

  ws.getCell("B13").value = "Total Transactions:";
  ws.getCell("C13").value = ordered.length - 1;

  styleSummaryBox(ws);

  const headerRow = 15;
  ws.getRow(headerRow).values = [
    "",
    "Date",
    "Description",
    "Reference",
    "Type",
    "Debit (Base)",
    "Credit (Base)",
    "Running (Base)",
    "Qty",
    "Unit Price",
    "Currency",
    "FX Rate",
  ];
  styleTableHeader(ws, headerRow, 2, 12);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = [
      "",
      row.dateISO,
      row.description,
      row.reference,
      row.type,
      row.debitBaseMinor ? row.debitBaseMinor / 100 : "",
      row.creditBaseMinor ? row.creditBaseMinor / 100 : "",
      row.runningBaseMinor / 100,
      row.qty ?? "",
      row.unitPrice ?? "",
      row.currency ?? "",
      row.fxRate ?? "",
    ];
    styleTableBodyRow(ws, r, 2, 12);
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    ws.getRow(r).getCell(7).numFmt = "#,##0.00";
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}