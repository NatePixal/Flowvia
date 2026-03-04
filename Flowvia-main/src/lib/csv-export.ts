
'use client';

import * as XLSX from 'xlsx';

/**
 * Exports an array of objects to a CSV file and triggers a download.
 * @param data The array of data to export. Must be an array of flat objects.
 * @param filename The desired filename for the downloaded file (e.g., "sales.csv").
 */
export function exportToCSV<T extends any[]>(data: T, filename: string) {
  if (!data || data.length === 0) {
    console.warn("Export failed: data is empty.");
    return;
  }

  // Create a new workbook and a worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  // Generate the CSV file and trigger a download
  XLSX.writeFile(wb, filename);
}
