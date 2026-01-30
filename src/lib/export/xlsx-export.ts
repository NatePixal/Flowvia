// src/lib/export/xlsx-export.ts
import * as XLSX from "xlsx";

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => any;
};

function safeCell(v: any) {
  if (v === undefined || v === null) return "";

  // Return Date objects directly so xlsx can handle them
  if (v instanceof Date) {
    return v;
  }

  if (typeof v === "number") {
    if (!Number.isFinite(v)) return ""; // prevent NaN/Infinity
    return v;
  }

  return v;
}

export function exportToXlsx<T>(
  filename: string,
  sheetName: string,
  rows: T[],
  columns: ExportColumn<T>[]
) {
  // Create header row
  const header = columns.map(c => c.header);

  // Create data rows, ensuring values are native types
  const data = rows.map(r => columns.map(c => safeCell(c.value(r))));

  // Combine header and data
  const aoa = [header, ...data];

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // --- ENHANCEMENTS ---
  // 1. Set Column Widths
  const colWidths = columns.map((_, i) => {
    let maxLen = header[i].length;
    for (const row of data) {
      const cell = row[i];
      if (cell === null || cell === undefined) continue;
      const len = cell instanceof Date ? 18 : String(cell).length;
      if (len > maxLen) {
        maxLen = len;
      }
    }
    // Add some padding, with a max and min width
    return { wch: Math.max(10, Math.min(maxLen + 2, 40)) };
  });
  ws['!cols'] = colWidths;

  // 2. Freeze Header Row
  ws['!freeze'] = { ySplit: 1 };

  // 3. Add AutoFilter
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(ws['!ref']!)) };

  // --- WORKBOOK CREATION ---
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // --- FILE DOWNLOAD ---
  // Using type 'binary' is important for date handling
  XLSX.writeFile(wb, filename, { bookType: 'xlsx', type: 'binary' });
}
