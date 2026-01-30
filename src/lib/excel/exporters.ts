import { exportToXlsx } from "@/lib/export/xlsx-export";
import { fromMinor, toMinor } from "@/lib/money";
import { Client, ClientLedgerEntry, Currency, DailyExpense, Product, Sale, UserProfile, Employee } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

const safeToDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (v instanceof Timestamp) return v.toDate();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function exportSalesXlsx(filename: string, sales: Sale[], productsById: Map<string, Product>, sellersById?: Map<string, UserProfile>) {
  exportToXlsx(filename, "Sales", sales, [
    { header: "Date", value: (r) => safeToDate(r.recordedAt ?? r.createdAt ?? r.date) },
    { header: "Product Code", value: (r) => r.productCode },
    { header: "Product Name", value: (r) => r.productName },
    { header: "Seller", value: (r) => r.sellerName },
    { header: "Client", value: (r) => r.clientName },
    { header: "Payment Type", value: (r) => r.paymentType },
    { header: "Currency", value: (r) => r.salePriceCurrency },
    { header: "Quantity", value: (r) => r.quantity },
    { header: "Unit Price", value: (r) => r.salePrice },
    { header: "Total", value: (r) => fromMinor(r.revenueMinor || 0, r.salePriceCurrency as Currency) },
    { header: "Gross Profit", value: (r) => fromMinor(r.grossProfitMinor || 0, r.salePriceCurrency as Currency) },
  ]);
}

export function exportInventoryXlsx(filename: string, products: Product[]) {
  exportToXlsx(filename, "Inventory", products, [
    { header: "Product Code", value: (r) => r.productCode },
    { header: "Name", value: (r) => r.name },
    { header: "Category", value: (r) => r.category },
    { header: "Quantity", value: (r) => r.quantity },
    { header: "Avg. Cost", value: (r) => fromMinor(r.costMinor ?? toMinor(r.cost, r.purchasePriceCurrency as Currency), r.purchasePriceCurrency as Currency) },
    { header: "Purchase Currency", value: (r) => r.purchasePriceCurrency },
    { header: "Selling Price", value: (r) => r.sellingPrice },
    { header: "Selling Currency", value: (r) => r.sellingPriceCurrency },
    { header: "Supplier", value: (r) => r.supplier },
    { header: "Min. Stock", value: (r) => r.minStock },
    { header: "Location", value: (r) => r.warehouseLocation },
    { header: "Added On", value: (r) => safeToDate(r.recordedAt ?? r.createdAt) }
  ]);
}

export function exportExpensesXlsx(filename: string, expenses: DailyExpense[]) {
  exportToXlsx(filename, "Expenses", expenses, [
    { header: "Date", value: (r) => safeToDate(r.date) },
    { header: "Category", value: (r) => r.expenseType },
    { header: "Description", value: (r) => r.description },
    { header: "Amount", value: (r) => r.amount },
    { header: "Currency", value: (r) => r.currency },
    { header: "Employee ID", value: (r) => r.employee_id },
    { header: "Seller ID", value: (r) => r.paid_to_seller_id },
  ]);
}

export function exportClientLedgerXlsx(filename: string, client: Client, ledger: ClientLedgerEntry[]) {
  const sorted = ledger.slice().sort((a, b) => {
    const at = safeToDate(a.purchaseDate ?? a.createdAt)?.getTime() ?? 0;
    const bt = safeToDate(b.purchaseDate ?? b.createdAt)?.getTime() ?? 0;
    return at - bt;
  });

  exportToXlsx(filename, `Ledger - ${client.name}`, sorted, [
    { header: "Date", value: (r) => safeToDate(r.purchaseDate ?? r.createdAt) },
    { header: "Type", value: (r) => r.type },
    { header: "Currency", value: (r) => r.currency },
    { header: "Total", value: (r) => fromMinor(r.totalMinor ?? 0, r.currency as Currency) },
    { header: "Paid", value: (r) => fromMinor(r.paidMinor ?? 0, r.currency as Currency) },
    { header: "Due", value: (r) => fromMinor(r.dueMinor ?? 0, r.currency as Currency) },
    { header: "Note", value: (r) => r.note },
  ]);
}

export function exportEmployeeSalaryXlsx(filename: string, employee: Employee, salaryExpenses: DailyExpense[]) {
  const sorted = salaryExpenses.slice().sort((a, b) => {
    const at = safeToDate(a.date)?.getTime() ?? 0;
    const bt = safeToDate(b.date)?.getTime() ?? 0;
    return at - bt;
  });

  exportToXlsx(filename, `Salary - ${employee.employee_name}`, sorted, [
    { header: "Date", value: (r) => safeToDate(r.date) },
    { header: "Employee ID", value: (r) => r.employee_id },
    { header: "Employee Name", value: () => employee.employee_name },
    { header: "Amount", value: (r) => r.amount },
    { header: "Currency", value: (r) => r.currency },
    { header: "Note", value: (r) => r.description },
  ]);
}
