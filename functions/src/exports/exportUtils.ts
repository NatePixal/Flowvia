import ExcelJS from "exceljs";
import { Timestamp } from "firebase-admin/firestore";

export type DateRange = { from: Timestamp; toExclusive: Timestamp };

export function makeDateRange(fromISO: string, toISO: string): DateRange {
  // Inclusive day range: [from 00:00, (to+1day) 00:00)
  const from = new Date(fromISO + "T00:00:00.000Z");
  const to = new Date(toISO + "T00:00:00.000Z");
  const toExclusive = new Date(to);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  return {
    from: Timestamp.fromDate(from),
    toExclusive: Timestamp.fromDate(toExclusive),
  };
}

export function money(n: number): string {
  // show $1,234.56 style (Excel can format too, but this is ok for strings in summary)
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function applyGlobalWorkbookStyle(wb: ExcelJS.Workbook) {
  wb.creator = "FlowVia";
  wb.created = new Date();
}

export function setSheetPrintDefaults(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws.views = [{ state: "frozen", ySplit: 12 }];
}

export function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.mergeCells("B2:H2");
  ws.mergeCells("B3:H3");

  ws.getCell("B2").value = title;
  ws.getCell("B2").font = { bold: true, size: 14, color: { argb: "1F2937" } };
  ws.getCell("B2").alignment = { horizontal: "center", vertical: "middle" };

  ws.getCell("B3").value = subtitle;
  ws.getCell("B3").font = { bold: true, size: 11, color: { argb: "374151" } };
  ws.getCell("B3").alignment = { horizontal: "center", vertical: "middle" };
}

export function styleInfoRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string) {
  ws.getCell(`B${row}`).value = label;
  ws.getCell(`B${row}`).font = { bold: true, size: 10, color: { argb: "111827" } };
  ws.getCell(`C${row}`).value = value;
  ws.getCell(`C${row}`).font = { size: 10, color: { argb: "111827" } };
}

export function styleSummaryBox(ws: ExcelJS.Worksheet) {
  // Box area: B7:D11 like screenshot
  const boxFill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E5AA8" } }; // blue
  const labelFont = { bold: true, size: 10, color: { argb: "FFFFFF" } };
  const valFont = { bold: true, size: 10, color: { argb: "111827" } };

  for (let r = 7; r <= 11; r++) {
    ws.getCell(`B${r}`).fill = boxFill as any;
    ws.getCell(`B${r}`).font = labelFont;
    ws.getCell(`B${r}`).alignment = { vertical: "middle" };
    ws.getCell(`C${r}`).font = valFont;
    ws.getCell(`C${r}`).alignment = { vertical: "middle", horizontal: "right" };
  }

  // borders
  for (const cell of ["B7", "C7", "B8", "C8", "B9", "C9", "B10", "C10", "B11", "C11"]) {
    ws.getCell(cell).border = {
      top: { style: "thin", color: { argb: "CBD5E1" } },
      left: { style: "thin", color: { argb: "CBD5E1" } },
      bottom: { style: "thin", color: { argb: "CBD5E1" } },
      right: { style: "thin", color: { argb: "CBD5E1" } },
    };
  }
}

export function styleTableHeader(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E5AA8" } } as any;
    cell.font = { bold: true, color: { argb: "FFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "CBD5E1" } },
      left: { style: "thin", color: { argb: "CBD5E1" } },
      bottom: { style: "thin", color: { argb: "CBD5E1" } },
      right: { style: "thin", color: { argb: "CBD5E1" } },
    };
  }
  ws.getRow(row).height = 18;
}

export function styleTableBodyRow(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.font = { size: 10, color: { argb: "111827" } };
    cell.border = {
      top: { style: "thin", color: { argb: "E5E7EB" } },
      left: { style: "thin", color: { argb: "E5E7EB" } },
      bottom: { style: "thin", color: { argb: "E5E7EB" } },
      right: { style: "thin", color: { argb: "E5E7EB" } },
    };
    cell.alignment = { vertical: "middle" };
  }
}
