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

type ExportExpenseInput = {
  companyId: string;
  baseCurrency: string;
  from: string;
  to: string;
};

export async function exportExpenseStatementExcel(input: ExportExpenseInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // Expect dailyExpenses docs: companyId, businessDate, category, description, amount, currency, fxRate, reference
  const expSnap = await db.collection("dailyExpenses")
    .where("companyId", "==", input.companyId)
    .where("date", ">=", range.from)
    .where("date", "<", range.toExclusive)
    .orderBy("date", "asc")
    .get();

  const wb = new ExcelJS.Workbook();
  applyGlobalWorkbookStyle(wb);
  const ws = wb.addWorksheet("Expenses");
  setSheetPrintDefaults(ws);

  ws.getColumn("A").width = 2;
  ws.getColumn("B").width = 14;
  ws.getColumn("C").width = 16;
  ws.getColumn("D").width = 34;
  ws.getColumn("E").width = 14;
  ws.getColumn("F").width = 12;
  ws.getColumn("G").width = 10;
  ws.getColumn("H").width = 18;

  styleTitle(ws, "FlowVia Business Solutions", "Expense Statement");
  styleInfoRow(ws, 5, "Base Currency:", input.baseCurrency);
  styleInfoRow(ws, 6, "Period:", `From ${input.from} to ${input.to}`);

  const headerRow = 12;
  ws.getRow(headerRow).values = ["", "Date", "Type", "Description", "Amount", "Currency", "FX Rate", "Amount (Base)"];
  styleTableHeader(ws, headerRow, 2, 8);

  let r = headerRow + 1;
  let totalBase = 0;

  for (const d of expSnap.docs) {
    const x = d.data();
    const baseMinor = Number(x.amountBaseMinor ?? 0);
    totalBase += baseMinor;

    ws.getRow(r).values = [
      "",
      x.date?.toDate().toISOString().slice(0, 10),
      x.expenseType || "expense",
      x.description || "",
      Number(x.amount ?? 0),
      x.currency ?? "",
      extractFxRate(x.fx) ?? "",
      baseMinor / 100,
    ];
    styleTableBodyRow(ws, r, 2, 8);
    ws.getRow(r).getCell(8).numFmt = "#,##0.00";
    r++;
  }

  ws.getRow(r).values = ["", "Total", "", "", "", "", "", totalBase / 100];
  styleTableBodyRow(ws, r, 2, 8);
  ws.getRow(r).getCell(2).font = { bold: true };
  ws.getRow(r).getCell(8).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
