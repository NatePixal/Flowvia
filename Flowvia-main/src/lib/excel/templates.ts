import { exportToExcel } from "@/lib/export-excel";

export type ExcelTemplate = {
  filename: string;
  sheetName: string;
  columns: { key: string; required?: boolean; note?: string }[];
};

function makeHeaderRow(tpl: ExcelTemplate) {
  const row: Record<string, any> = {};
  tpl.columns.forEach((c) => (row[c.key] = ""));
  return row;
}

export function downloadTemplate(tpl: ExcelTemplate) {
  exportToExcel({
    fileName: tpl.filename,
    sheets: [
        {
        sheetName: tpl.sheetName,
        rows: [makeHeaderRow(tpl)],
        },
    ],
  });
}

export const TPL_PRODUCTS: ExcelTemplate = {
  filename: "import_products.xlsx",
  sheetName: "products",
  columns: [
    { key: "productCode", required: true },
    { key: "name", required: true },
    { key: "category" },
    { key: "quantity" },
    { key: "cost" }, // must be a valid number (avoid NaN)
    { key: "supplier" },
    { key: "location" },
    { key: "minStock" },
    { key: "sellingPrice" },
    { key: "priceCurrency" }, // USD | UZS | AED | CNY
  ],
};

export const TPL_EXPENSES: ExcelTemplate = {
  filename: "import_expenses.xlsx",
  sheetName: "expenses",
  columns: [
    { key: "date", required: true }, // ISO string or Excel date
    { key: "expenseType", required: true },
    { key: "description" },
    { key: "amount", required: true },
    { key: "currency", required: true },
    // Optional salary linkage
    { key: "employee_id" },
    { key: "paid_to_seller_id" },
  ],
};

export const TPL_CLIENT_LEDGER: ExcelTemplate = {
  filename: "import_client_ledger.xlsx",
  sheetName: "client_ledger",
  columns: [
    { key: "date", required: true },
    { key: "entryType", required: true }, // purchase | payment
    { key: "currency", required: true },
    { key: "amount", required: true }, // major units (e.g. 500000 for UZS, 12.5 for USD)
    { key: "note" },
  ],
};

export const TPL_EMPLOYEE_SALARY: ExcelTemplate = {
  filename: "import_employee_salary.xlsx",
  sheetName: "employee_salary",
  columns: [
    { key: "date", required: true },
    { key: "employee_id" }, // recommended
    { key: "employee_name" }, // fallback if id not provided
    { key: "amount", required: true },
    { key: "currency", required: true },
    { key: "note" },
  ],
};
