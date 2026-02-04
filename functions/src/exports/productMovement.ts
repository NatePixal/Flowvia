import * as admin from "firebase-admin";
import ExcelJS from "exceljs";
import {
  applyGlobalWorkbookStyle,
  makeDateRange,
  setSheetPrintDefaults,
  styleInfoRow,
  styleTableBodyRow,
  styleTableHeader,
  styleTitle,
} from "./exportUtils";

function extractFxRate(fx: any): number | undefined {
  return fx?.enteredRate ?? fx?.rateToBase ?? undefined;
}

type ExportProductInput = {
  companyId: string;
  productCode: string;
  from: string;
  to: string;
};

export async function exportProductMovementExcel(input: ExportProductInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // Incoming in range (incomeDate)
  const incSnap = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("productCode", "==", input.productCode)
    .where("incomeDate", ">=", range.from)
    .where("incomeDate", "<", range.toExclusive)
    .orderBy("incomeDate", "asc")
    .get();

  // Sales in range (date)
  const salesSnap = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("productCode", "==", input.productCode)
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  // Opening qty: incoming before - sold before
  const incBefore = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("productCode", "==", input.productCode)
    .where("incomeDate", "<", range.from)
    .get();

  const salesBefore = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("productCode", "==", input.productCode)
    .where("date", "<", range.from)
    .get();

  const openingIn = incBefore.docs.reduce((a, d) => a + Number(d.data().quantity ?? 0), 0);
  const openingSold = salesBefore.docs.reduce((a, d) => a + Number(d.data().quantity ?? 0), 0);
  let balanceQty = openingIn - openingSold;

  const rows: any[] = [];
  rows.push({
    dateISO: input.from,
    desc: "Opening Quantity",
    ref: "-",
    type: "Opening",
    inQty: "",
    outQty: "",
    balanceQty,
    unitCost: "",
    currency: "",
    fxRate: "",
  });

  for (const d of incSnap.docs) {
    const x = d.data();
    const inQty = Number(x.quantity ?? 0);
    balanceQty += inQty;

    rows.push({
      dateISO: x.incomeDate?.toDate().toISOString().slice(0, 10),
      desc: `Incoming (${x.supplier ?? ""})`.trim(),
      ref: d.id,
      type: "In",
      inQty,
      outQty: "",
      balanceQty,
      unitCost: Number(x.unitCost ?? 0),
      currency: x.currency ?? "",
      fxRate: extractFxRate(x.fx) ?? "",
    });
  }

  for (const d of salesSnap.docs) {
    const s = d.data();
    const outQty = Number(s.quantity ?? 0);
    balanceQty -= outQty;

    rows.push({
      dateISO: s.date?.toDate().toISOString().slice(0, 10),
      desc: `Sale (${s.clientName ?? ""})`.trim(),
      ref: d.id,
      type: "Out",
      inQty: "",
      outQty,
      balanceQty,
      unitCost: "", // optional: you have costOfGoodsSoldMinor already
      currency: s.salePriceCurrency ?? "",
      fxRate: extractFxRate(s.fx) ?? "",
    });
  }

  const opening = rows.shift();
  rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ordered = [opening, ...rows];

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Product Movement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 14;
  ws.getColumn("C").width = 34;
  ws.getColumn("D").width = 16;
  ws.getColumn("E").width = 10;
  ws.getColumn("F").width = 10;
  ws.getColumn("G").width = 10;
  ws.getColumn("H").width = 12;
  ws.getColumn("I").width = 12;
  ws.getColumn("J").width = 10;
  ws.getColumn("K").width = 10;

  styleTitle(ws, "FlowVia Business Solutions", "Product Movement Statement");
  styleInfoRow(ws, 5, "Product Code:", input.productCode);
  styleInfoRow(ws, 6, "Period:", `From ${input.from} to ${input.to}`);

  const headerRow = 12;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "In", "Out", "Balance", "Unit Cost", "FX Rate", "Currency"];
  styleTableHeader(ws, headerRow, 2, 11);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = ["", row.dateISO, row.desc, row.ref, row.type, row.inQty, row.outQty, row.balanceQty, row.unitCost, row.fxRate, row.currency];
    styleTableBodyRow(ws, r, 2, 11);
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
