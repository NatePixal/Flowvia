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

type ExportSupplierInput = {
  companyId: string;
  supplierId: string;   // used for ledger path
  supplierName: string; // used for incomingProducts field `supplier`
  baseCurrency: string;
  from: string;
  to: string;
};

function extractFxRate(fx: any): number | undefined {
  return fx?.enteredRate ?? fx?.rateToBase ?? undefined;
}

export async function exportSupplierStatementExcel(input: ExportSupplierInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // Incoming purchases by supplier name + incomeDate
  const incSnap = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("supplier", "==", input.supplierName)
    .where("incomeDate", ">=", range.from)
    .where("incomeDate", "<", range.toExclusive)
    .orderBy("incomeDate", "asc")
    .get();

  // Supplier payments: ledger subcollection
  const ledgerRef = db.collection("companies").doc(input.companyId)
    .collection("suppliers").doc(input.supplierId)
    .collection("ledger");

  const paySnap = await ledgerRef
    .where("type", "==", "payment")
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Opening = purchases - payments before range
  const incBefore = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("supplier", "==", input.supplierName)
    .where("incomeDate", "<", range.from)
    .get();

  const payBefore = await ledgerRef
    .where("type", "==", "payment")
    .where("businessDate", "<", range.from)
    .get();

  const sumIncBefore = incBefore.docs.reduce((a, d) => a + Number(d.data().totalCostBaseMinor ?? 0), 0);
  const sumPayBefore = payBefore.docs.reduce((a, d) => a + Number(d.data().paymentMinor ?? 0), 0);

  let running = sumIncBefore - sumPayBefore; // we owe supplier

  const rows: any[] = [];
  rows.push({
    dateISO: input.from,
    desc: "Opening Balance",
    ref: "-",
    type: "Opening",
    debitBaseMinor: running > 0 ? running : 0,
    creditBaseMinor: running < 0 ? Math.abs(running) : 0,
    runningBaseMinor: running,
    qty: "",
    unitCost: "",
    currency: "",
    fxRate: "",
  });

  for (const d of incSnap.docs) {
    const x = d.data();
    const totalBaseMinor = Number(x.totalCostBaseMinor ?? 0);
    running += totalBaseMinor;

    rows.push({
      dateISO: x.incomeDate?.toDate().toISOString().slice(0, 10),
      desc: `Incoming - ${x.productCode ?? ""}`.trim(),
      ref: d.id,
      type: "Purchase",
      debitBaseMinor: totalBaseMinor,
      creditBaseMinor: 0,
      runningBaseMinor: running,
      qty: Number(x.quantity ?? 0),
      unitCost: Number(x.unitCost ?? 0),
      currency: x.currency ?? "",
      fxRate: extractFxRate(x.fx),
    });
  }

  for (const d of paySnap.docs) {
    const p = d.data();
    const payMinor = Number(p.paymentMinor ?? 0);
    running -= payMinor;

    rows.push({
      dateISO: p.businessDate?.toDate().toISOString().slice(0, 10),
      desc: p.note || "Payment Sent",
      ref: d.id,
      type: "Payment",
      debitBaseMinor: 0,
      creditBaseMinor: payMinor,
      runningBaseMinor: running,
      qty: "",
      unitCost: "",
      currency: p.currency ?? "",
      fxRate: extractFxRate(p.fx),
    });
  }

  const opening = rows.shift();
  rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ordered = [opening, ...rows];

  const totalPurchases = ordered.reduce((a, r) => a + (r.debitBaseMinor || 0), 0) - (opening.debitBaseMinor || 0);
  const totalPayments = ordered.reduce((a, r) => a + (r.creditBaseMinor || 0), 0) - (opening.creditBaseMinor || 0);
  const closing = ordered[ordered.length - 1]?.runningBaseMinor ?? opening.runningBaseMinor;

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Supplier Statement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 14;
  ws.getColumn("C").width = 34;
  ws.getColumn("D").width = 16;
  ws.getColumn("E").width = 10;
  ws.getColumn("F").width = 14;
  ws.getColumn("G").width = 14;
  ws.getColumn("H").width = 16;
  ws.getColumn("I").width = 8;
  ws.getColumn("J").width = 12;
  ws.getColumn("K").width = 10;
  ws.getColumn("L").width = 10;

  styleTitle(ws, "FlowVia Business Solutions", "Accounts Payable Statement");
  styleInfoRow(ws, 5, "Supplier:", input.supplierName);
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
    "Unit Cost",
    "Currency",
    "FX Rate",
  ];
  styleTableHeader(ws, headerRow, 2, 12);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = [
      "",
      row.dateISO,
      row.desc,
      row.ref,
      row.type,
      row.debitBaseMinor ? row.debitBaseMinor / 100 : "",
      row.creditBaseMinor ? row.creditBaseMinor / 100 : "",
      row.runningBaseMinor / 100,
      row.qty ?? "",
      row.unitCost ?? "",
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
