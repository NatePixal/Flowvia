import * as XLSX from "xlsx";

export type XlsxRow = Record<string, any>;

function normalizeKey(k: string) {
  return String(k || "")
    .trim()
    .replace(/\s+/g, "_");
}

export function parseLooseNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const s = String(v)
    .trim()
    // remove spaces and non-breaking spaces
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    // allow "500,000" -> "500000" BUT also allow "12,5" decimals
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(/,/g, ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseDateLoose(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  // Excel sometimes gives numbers for dates
  if (typeof v === "number") {
    // XLSX date serial -> JS Date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }

  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export async function readFirstSheetRows(file: File): Promise<XlsxRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws, {
    defval: "",
    raw: false,
  });

  // normalize keys
  return rows.map((r) => {
    const out: XlsxRow = {};
    for (const [k, v] of Object.entries(r)) out[normalizeKey(k)] = v;
    return out;
  });
}

export function requireColumns(rows: XlsxRow[], required: string[]) {
  if (!rows.length) throw new Error("The Excel file has no rows.");
  const keys = new Set(Object.keys(rows[0] || {}));
  const missing = required.filter((c) => !keys.has(c));
  if (missing.length) {
    throw new Error(`Missing required columns: ${missing.join(", ")}`);
  }
}
