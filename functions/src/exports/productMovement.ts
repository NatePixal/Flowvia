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

type ExportProductInput = {
  companyId: string;
  productId: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

export async function exportProductMovementExcel(input: ExportProductInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  const prodSnap = await db.collection("products").doc(input.productId).get();
  const productName = prodSnap.exists ? (prodSnap.data()?.name || "Product") : "Product";
  const sku = prodSnap.data()?.sku || prodSnap.data()?.code || input.productId;

  // Incomings
  const incSnap = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("productId", "==", input.productId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Sales (items array)
  const salesSnap = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("businessDate", ">=", range.from)
    .where("businessDate", "<", range.toExclusive)
    .orderBy("businessDate", "asc")
    .get();

  // Opening qty = (incoming before) - (sold before)
  const incBefore = await db.collection("incomingProducts")
    .where("companyId", "==", input.companyId)
    .where("productId", "==", input.productId)
    .where("businessDate", "<", range.from)
    .get();

  const salesBefore = await db.collection("sales")
    .where("companyId", "==", input.companyId)
    .where("businessDate", "<", range.from)
    .get();

  const openingIn = incBefore.docs.reduce((a, d) => a + Number(d.data().qty ?? 0), 0);

  const openingSold = salesBefore.docs.reduce((a, d) => {
    const s = d.data();
    const items = Array.isArray(s.items) ? s.items : [];
    const qty = items
      .filter((it: any) => it.productId === input.productId)
      .reduce((x: number, it: any) => x + Number(it.qty ?? 0), 0);
    return a + qty;
  }, 0);

  let runningQty = openingIn - openingSold;

  const movements: any[] = [];
  movements.push({
    date: input.from,
    description: "Opening Quantity",
    reference: "-",
    type: "Opening",
    inQty: "",
    outQty: "",
    balanceQty: runningQty,
    unitCost: "",
    fx: "",
    currency: "",
  });

  // incoming rows
  for (const d of incSnap.docs) {
    const x = d.data();
    const inQty = Number(x.qty ?? 0);
    runningQty += inQty;

    movements.push({
      date: x.businessDate.toDate().toISOString().slice(0, 10),
      description: x.description || "Incoming Stock",
      reference: x.reference || x.ref || d.id,
      type: "In",
      inQty,
      outQty: "",
      balanceQty: runningQty,
      unitCost: x.unitPrice ?? x.cost ?? "",
      fx: x.fxRate ?? x.rate ?? "",
      currency: x.currency ?? "",
    });
  }

  // sales rows
  for (const d of salesSnap.docs) {
    const s = d.data();
    const items = Array.isArray(s.items) ? s.items : [];
    const item = items.find((it: any) => it.productId === input.productId);
    if (!item) continue;

    const outQty = Number(item.qty ?? 0);
    runningQty -= outQty;

    movements.push({
      date: s.businessDate.toDate().toISOString().slice(0, 10),
      description: s.description || "Sale",
      reference: s.invoiceNo || d.id,
      type: "Out",
      inQty: "",
      outQty,
      balanceQty: runningQty,
      unitCost: item.unitCost ?? "",
      fx: s.fxRate ?? s.rate ?? "",
      currency: s.currency ?? "",
    });
  }

  // Sort (opening first)
  const opening = movements.shift();
  movements.sort((a, b) => a.date.localeCompare(b.date));
  const ordered = [opening, ...movements];

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);

  const ws = wb.addWorksheet("Product Movement");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 14; // Date
  ws.getColumn("C").width = 34; // Desc
  ws.getColumn("D").width = 16; // Ref
  ws.getColumn("E").width = 10; // Type
  ws.getColumn("F").width = 10; // In
  ws.getColumn("G").width = 10; // Out
  ws.getColumn("H").width = 14; // Balance
  ws.getColumn("I").width = 12; // Unit cost
  ws.getColumn("J").width = 10; // FX
  ws.getColumn("K").width = 10; // Cur

  styleTitle(ws, "FlowVia Business Solutions", "Product Movement Statement");
  styleInfoRow(ws, 5, "Product:", `${productName} (${sku})`);
  styleInfoRow(ws, 6, "Period:", `From ${input.from} to ${input.to}`);

  const headerRow = 12;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "In", "Out", "Balance", "Unit Cost", "FX Rate", "Currency"];
  styleTableHeader(ws, headerRow, 2, 11);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = ["", row.date, row.description, row.reference, row.type, row.inQty, row.outQty, row.balanceQty, row.unitCost, row.fx, row.currency];
    styleTableBodyRow(ws, r, 2, 11);
    ws.getRow(r).getCell(9).numFmt = "#,##0.00";
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
