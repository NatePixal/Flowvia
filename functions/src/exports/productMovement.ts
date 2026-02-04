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

  const prodSnap = await db.doc(`companies/${input.companyId}/products/${input.productId}`).get();
  const productData = prodSnap.data() || {};
  const productName = productData.name || "Product";
  const productCode = productData.productCode || input.productId;

  // Incomings
  const incSnap = await db.collection(`companies/${input.companyId}/incomingProducts`)
    .where("productCode", "==", productCode)
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  // Sales
  const salesSnap = await db.collection(`companies/${input.companyId}/sales`)
    .where("productId", "==", input.productId)
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  // Opening qty
  const incBefore = await db.collection(`companies/${input.companyId}/incomingProducts`)
    .where("productCode", "==", productCode)
    .where("date", "<", range.from)
    .get();

  const salesBefore = await db.collection(`companies/${input.companyId}/sales`)
    .where("productId", "==", input.productId)
    .where("date", "<", range.from)
    .get();

  const openingIn = incBefore.docs.reduce((a, d) => a + Number(d.data().quantity ?? 0), 0);
  const openingSold = salesBefore.docs.reduce((a, d) => a + Number(d.data().quantity ?? 0), 0);

  let runningQty = openingIn - openingSold;

  const movements: any[] = [];
  movements.push({
    date: range.from.toDate(),
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
    const inQty = Number(x.quantity ?? 0);
    runningQty += inQty;

    movements.push({
      date: x.date.toDate(),
      description: x.supplier ? `Incoming from ${x.supplier}` : "Incoming Stock",
      reference: d.id,
      type: "In",
      inQty,
      outQty: "",
      balanceQty: runningQty,
      unitCost: x.unitCost ?? "",
      currency: x.currency ?? "",
    });
  }

  // sales rows
  for (const d of salesSnap.docs) {
    const s = d.data();
    const outQty = Number(s.quantity ?? 0);
    runningQty -= outQty;

    movements.push({
      date: s.date.toDate(),
      description: s.clientName ? `Sale to ${s.clientName}` : "Sale",
      reference: d.id,
      type: "Out",
      inQty: "",
      outQty,
      balanceQty: runningQty,
      unitCost: s.salePrice ?? "",
      currency: s.salePriceCurrency ?? "",
    });
  }

  // Sort
  const opening = movements.shift();
  movements.sort((a, b) => a.date.getTime() - b.date.getTime());
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
  ws.getColumn("J").width = 10; // Cur

  styleTitle(ws, "FlowVia Business Solutions", "Product Movement Statement");
  styleInfoRow(ws, 5, "Product:", `${productName} (${productCode})`);
  styleInfoRow(ws, 6, "Period:", `From ${input.from} to ${input.to}`);

  const headerRow = 12;
  ws.getRow(headerRow).values = ["", "Date", "Description", "Reference", "Type", "In", "Out", "Balance", "Unit Cost", "Currency"];
  styleTableHeader(ws, headerRow, 2, 10);

  let r = headerRow + 1;
  for (const row of ordered) {
    ws.getRow(r).values = ["", row.date, row.description, row.reference, row.type, row.inQty, row.outQty, row.balanceQty, row.unitCost, row.currency];
    styleTableBodyRow(ws, r, 2, 10);
    ws.getCell(r, 2).numFmt = 'yyyy-mm-dd';
    ws.getCell(r, 9).numFmt = "#,##0.00";
    r++;
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
