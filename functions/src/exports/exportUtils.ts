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

export function money(n: number): { value: number; format: string } {
    return { value: n / 100, format: '#,##0.00' };
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
  ws.views = [{ state: "frozen", ySplit: 15 }];
}

export function styleTitle(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  ws.mergeCells("B2:H2");
  ws.mergeCells("B3:H3");

  ws.getCell("B2").value = title;
  ws.getCell("B2").font = { bold: true, size: 14, color: { argb: "FF1F2937" } };
  ws.getCell("B2").alignment = { horizontal: "center", vertical: "middle" };

  ws.getCell("B3").value = subtitle;
  ws.getCell("B3").font = { bold: true, size: 11, color: { argb: "FF374151" } };
  ws.getCell("B3").alignment = { horizontal: "center", vertical: "middle" };
}

export function styleInfoRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string) {
  ws.getCell(`B${row}`).value = label;
  ws.getCell(`B${row}`).font = { bold: true, size: 10, color: { argb: "FF111827" } };
  ws.getCell(`C${row}`).value = value;
  ws.getCell(`C${row}`).font = { size: 10, color: { argb: "FF111827" } };
}

export function styleSummaryBox(ws: ExcelJS.Worksheet) {
  const boxFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5AA8" } }; // blue
  const labelFont = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
  const valFont = { bold: true, size: 10, color: { argb: "FF111827" } };

  for (let r = 9; r <= 12; r++) {
    const labelCell = ws.getCell(`C${r}`);
    labelCell.fill = boxFill as any;
    labelCell.font = labelFont;
    labelCell.alignment = { vertical: "middle", horizontal: "right" };
    setThinBorder(labelCell);

    const valCell = ws.getCell(`B${r}`);
    valCell.font = valFont;
    valCell.alignment = { vertical: "middle", horizontal: "right" };
    valCell.numFmt = '#,##0.00';
    setThinBorder(valCell);
  }
}

function setThinBorder(cell: ExcelJS.Cell) {
    cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    }
}

export function styleTableHeader(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E5AA8" } } as any;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    setThinBorder(cell);
  }
  ws.getRow(row).height = 18;
}

export function styleTableBodyRow(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = ws.getRow(row).getCell(c);
    cell.font = { size: 10, color: { argb: "FF111827" } };
    setThinBorder(cell);
    cell.alignment = { vertical: "middle" };
  }
}
