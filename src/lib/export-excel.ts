import * as XLSX from 'xlsx';

export function exportToExcel(opts: {
  fileName: string;
  sheets: { sheetName: string; rows: Array<Record<string, any>> }[];
}) {
  const wb = XLSX.utils.book_new();
  opts.sheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
  });
  XLSX.writeFile(wb, `${opts.fileName}`);
}
