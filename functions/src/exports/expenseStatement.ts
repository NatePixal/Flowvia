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

type ExportExpenseInput = {
  companyId: string;
  from: string;
  to: string;
  currency: string;
};

export async function exportExpenseStatementExcel(input: ExportExpenseInput): Promise<Buffer> {
  const db = admin.firestore();
  const range = makeDateRange(input.from, input.to);

  // CORRECTED: Use 'date' field instead of 'businessDate'
  const expSnap = await db.collection(`companies/${input.companyId}/dailyExpenses`)
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
  ws.getColumn("C").width = 18; // category
  ws.getColumn("D").width = 34; // description
  ws.getColumn("E").width = 16; // reference
  ws.getColumn("F").width = 14; // amount
  ws.getColumn("G").width = 10; // fx
  ws.getColumn("H").width = 10; // currency

  styleTitle(ws, "FlowVia Business Solutions", "Expense Statement");
  styleInfoRow(ws, 5, "Currency:", input.currency);
  styleInfoRow(ws, 6, "Period:", `From ${input.from} to ${input.to}`);

  const headerRow = 12;
  ws.getRow(headerRow).values = ["", "Date", "Category", "Description", "Reference", "Amount", "FX Rate", "Currency"];
  styleTableHeader(ws, headerRow, 2, 8);

  let r = headerRow + 1;
  let total = 0;

  for (const d of expSnap.docs) {
    const x = d.data();
    const amt = Number(x.amountBaseMinor ?? x.amountMinor ?? 0) / 100; // Assuming 2 decimals
    total += amt;

    ws.getRow(r).values = [
      "",
      x.date.toDate(), // Pass date object directly
      x.expenseType || "Expense",
      x.description || "",
      d.id,
      amt,
      x.fx?.rateToBase ?? "",
      x.currency ?? "",
    ];
    styleTableBodyRow(ws, r, 2, 8);
    ws.getRow(r).getCell(2).numFmt = 'yyyy-mm-dd';
    ws.getRow(r).getCell(6).numFmt = "#,##0.00";
    r++;
  }

  ws.getRow(r).values = ["", "Total", "", "", "", total, "", ""];
  styleTableBodyRow(ws, r, 2, 8);
  ws.getRow(r).getCell(2).font = { bold: true };
  ws.getRow(r).getCell(6).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
