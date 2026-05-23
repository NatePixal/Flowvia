
import type { Timestamp, FieldValue } from 'firebase-admin/firestore';

// Base type for currency codes
export type Currency = 'USD' | 'AED' | 'SAR' | 'JOD' | 'EGP' | 'UZS' | 'CNY';

// User roles as defined in the application logic
export type UserRole = 'developer' | 'admin' | 'manager' | 'sales' | 'accounting';

export type PaymentProvider = 'payme' | 'click' | 'manual' | 'stripe';

// A union type to represent a Firestore timestamp, which can be a Timestamp object
// on read or a FieldValue sentinel on write.
export type FirestoreTs = Timestamp | FieldValue;

// Defines the exchange rate snapshot stored with a transaction.
export type FxSnapshot = {
  rateToBase: number; // Normalized rate: how many base units per 1 transaction currency unit.
  enteredRate: number; // The rate as typed by the user.
  enteredPair: string; // The currency pair as shown to the user (e.g., "USD->UZS").
  capturedAt: FirestoreTs | any; // When the rate was recorded.
};


// Represents a user's profile information, linking them to a company and role.
export type UserProfile = {
  id: string; // The user's unique ID from Firebase Auth, matching the document ID.
  email: string;
  name: string;
  phoneNumber?: string;
  photoURL?: string | null;
  companyId: string;
  role: UserRole;
  isPaid: boolean;
  status: 'active' | 'inactive' | 'blocked';
  createdAt: FirestoreTs;
  updatedAt?: FirestoreTs;
  createdBy?: string;
  language?: 'en' | 'ru';
  currency?: Currency;
  uid?: string; // DEPRECATED: to be removed
};

// Represents a company or organization using the application.
export type Company = {
  id?: string; // Client-side document ID
  name: string;
  ownerId: string;
  userCount?: number;
  createdAt: FirestoreTs;
  baseCurrency?: Currency; // The company's primary reporting currency.
  isPaid?: boolean;
  subscriptionStatus?: 'active' | 'trialing' | 'past_due' | 'unpaid' | 'canceled' | 'expired' | 'inactive' | 'blocked' | 'refunded' | string;
  forcedSubscriptionStatus?: string;
  subscriptionProvider?: PaymentProvider;
  subscriptionId?: string;
  stripeCustomerId?: string;
  subscriptionPeriodStart?: FirestoreTs;
  subscriptionPeriodEnd?: FirestoreTs;
  lastPaymentAt?: FirestoreTs;
  cancelAtPeriodEnd?: boolean;
  trialEndsAt?: FirestoreTs;
  administrativeLock?: boolean;
  subscriptionAccessLocked?: boolean;
  ledgerAuditStatus?: 'verified' | 'needs_audit' | 'repair_required' | 'unknown';
  warehouseCapacity?: number;
  warehouseCapacityType?: 'units' | 'volume';
  memberUids?: string[];
  updatedAt?: FirestoreTs;
};

// Represents a product in the inventory.
export type Product = {
  id: string;
  companyId: string;
  name: string;
  category: string;
  size?: string;
  color?: string;
  specifications?: string;
  quantity: number;
  warehouseLocation?: string;
  productCode: string;

  purchasePrice: number; // major
  purchasePriceCurrency: Currency;

  sellingPrice: number; // major
  sellingPriceCurrency: Currency;

  supplier: string;
  weight?: number;
  imageUrl?: string;
  minStock?: number;
  lowStock?: boolean;

  // Legacy
  cost: number; // major units of purchasePriceCurrency (kept for backward compatibility)

  unitVolume?: number;
  updatedAt?: FirestoreTs;

  // NEW: avg cost tracking
  costMinor?: number;       // avg unit cost in MINOR of purchasePriceCurrency
  costBaseMinor?: number;   // avg unit cost in MINOR of company base currency

  // OPTIONAL audit snapshot (typically latest purchase FX)
  costFx?: FxSnapshot;

  // Backward-compat aliases
  createdAt?: FirestoreTs | Date | string;
  recordedAt?: Timestamp | Date | string;
};


// Represents a sales transaction.
export type Sale = {
  id: string; // Document ID
  companyId: string;
  clientId: string;
  productId: string;
  quantity: number;
  salePrice: number; // The price in the specified currency, major units
  paymentType: 'Cash' | 'Partial' | 'Loan';
  clientName: string;
  productName: string;
  productCode: string;
  salePriceCurrency: Currency;
  sellerId: string;
  sellerName: string;
  warehouse?: string;
  isDeleted?: boolean;
  deletedAt?: FirestoreTs;
  deletedBy?: string;
  createdBy?: string;
  
  // Base currency of the company at the time of sale
  baseCurrency?: Currency;
  // Exchange rate snapshot if sale currency is not the base currency
  fx?: FxSnapshot;
  
  // New standardized financial fields
  revenueMinor?: number; // Total revenue in MINOR units of salePriceCurrency
  costOfGoodsSoldMinor?: number; // COGS in MINOR units of salePriceCurrency
  grossProfitMinor?: number; // Gross profit in MINOR units of salePriceCurrency
  
  // New fields for base currency consolidation
  revenueBaseMinor?: number; // Total revenue in MINOR units of baseCurrency
  costOfGoodsSoldBaseMinor?: number; // COGS in MINOR units of baseCurrency
  grossProfitBaseMinor?: number; // Gross profit in MINOR units of baseCurrency

  // Date fields
  businessDay?: string | number; // frontend legacy string or backend numeric YYYYMMDD
  businessDate?: FirestoreTs | string;

  // Backward-compat aliases
  createdAt?: FirestoreTs | Date | string;
  date?: FirestoreTs | Date | string;
  recordedAt?: Timestamp | Date | string;
};


// Represents a client who purchases products.
export type Client = {
  id: string; // Document ID
  companyId: string; // Optional for backward compatibility, required for new clients
  name: string;
  phoneNumber?: string;
  location?: string;
  createdAt?: FirestoreTs;
  // Derived summary fields
  outstandingByCurrency?: { [key in Currency]?: number };
  openPurchasesCount?: number;
  lastActivityAt?: FirestoreTs;
};

export type ClientLedgerType = 'purchase' | 'payment' | 'adjustment';

export type ClientLedgerEntry = {
  id?: string;
  companyId: string;
  clientId: string;
  type: ClientLedgerType;

  // For purchase entries
  items?: Array<{
    productId?: string;
    name: string;
    qty: number;                // integer or decimal if needed
    unitPriceMinor: number;     // integer
    lineTotalMinor: number;     // qty * unitPriceMinor (rounded properly)
  }>;

  // Amounts
  currency: Currency;
  totalMinor: number;           // purchase total (for payments, set to paymentMinor)
  paidMinor: number;            // for purchase: how much paid at time of purchase
  dueMinor: number;             // totalMinor - paidMinor; for payments use 0

  // For payments
  paymentMinor?: number;        // positive integer

  // Metadata
  relatedSaleId?: string;
  note?: string;
  legacy?: boolean;
  
  // Date fields
  businessDay?: string | number; // frontend legacy string or backend numeric YYYYMMDD
  businessDate?: FirestoreTs | string;

  // Backward-compat aliases
  createdAt?: FirestoreTs | Date | string;
  purchaseDate?: Timestamp | Date | string;
};


// Represents a supplier or factory.
export type Supplier = {
  id: string; // Document ID
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  factoryName?: string;
  createdAt?: FirestoreTs;
  // Derived fields
  balanceDueByCurrency?: { [key in Currency]?: number };
  nextDueDate?: FirestoreTs;
  overdueCount?: number;
  lastActivityAt?: FirestoreTs;
};

export type SupplierLedgerType = 'purchase' | 'payment' | 'adjustment';

export type SupplierLedgerEntry = {
  id?: string;
  companyId: string;
  supplierId: string;
  type: SupplierLedgerType;

  currency: Currency;

  // Purchase
  purchaseTotalMinor?: number;
  purchasePaidMinor?: number;
  purchaseDueMinor?: number;
  dueDate?: FirestoreTs;                // Timestamp

  // Payment
  paymentMinor?: number;

  note?: string;
  createdAt: FirestoreTs;               // Firestore Timestamp
  
  // Date fields
  businessDay?: string | number; // frontend legacy string or backend numeric YYYYMMDD
  businessDate?: FirestoreTs | string;

  relatedIncomingLogId?: string; // Link to the incoming stock log
};


// Represents a log entry for inventory changes.
export type InventoryLog = {
  id: string; // Document ID
  companyId: string;
  productId: string;
  changeQuantity: number;
  logDate: string | FirestoreTs;
  reason: string;
  productCode: string;
  changeDate: FirestoreTs | any;
};

export type IncomingProductLog = {
  id: string;
  companyId: string;
  productCode: string;

  quantity: number;
  supplier?: string;

  // Receipt currency + unit cost (major)
  currency: Currency;
  unitCost: number;     // major
  totalCost: number;    // major (quantity * unitCost)

  // Receipt amounts (minor)
  unitCostMinor: number;
  totalCostMinor: number;

  // Base amounts (minor)
  baseCurrency: Currency;
  fx?: FxSnapshot;              // only if currency != baseCurrency
  unitCostBaseMinor: number;
  totalCostBaseMinor: number;

  // Optional UI/legacy fields if you want:
  name?: string;
  category?: string;
  location?: string;
  minStock?: number;

  // Date fields
  businessDay?: string | number; // frontend legacy string or backend numeric YYYYMMDD
  businessDate?: FirestoreTs | string;

  // Backward-compat aliases (your UI/exporters still reference these)
  date?: Timestamp | Date | string;
  recordedAt?: Timestamp | Date | string;
  incomeDate?: Timestamp | Date | string;
  createdAt?: Timestamp | Date | string;
};

// Represents a currency supported by the system.
export type CurrencyInfo = {
  id: string; // Document ID
  code: string;
  name: string;
  symbol: string;
};

// --- App-specific types not in backend.json ---

export type Seller = {
  id: string;
  companyId: string;
  name: string;
  contact?: string;
  status: 'active' | 'inactive';
  createdAt?: FirestoreTs;
};

export type Employee = {
    id:string;
    companyId: string;
    employee_name: string;
    role: string;
    employment_type: 'seller' | 'staff' | 'admin';
    salary_type: 'daily' | 'weekly' | 'monthly';
    default_salary_amount: number;
    salary_currency: Currency;
    status: 'active' | 'inactive';
    createdAt?: FirestoreTs;
};

export type DailyExpense = {
  id: string;
  companyId: string;
  expenseType: 'food' | 'salary' | 'transport' | 'rent' | 'utilities' | 'marketing' | 'others';
  description: string;
  amount: number; // Major units, in `currency`
  currency: Currency;
  date: string | FirestoreTs | Date;
  createdBy?: string;
  createdAt?: FirestoreTs;
  paid_to_seller_id?: string;
  paid_to_seller_name?: string;
  employee_id?: string;
  employee_name?: string;

  // New standardized fields
  baseCurrency?: Currency;
  fx?: FxSnapshot;
  amountMinor?: number; // Total expense in MINOR units of `currency`
  amountBaseMinor?: number; // Total expense in MINOR units of `baseCurrency`
  
  // Date fields
  businessDay?: string | number; // frontend legacy string or backend numeric YYYYMMDD
  businessDate?: FirestoreTs | string;
};

export type Invite = {
  id: string;
  email: string;
  companyId: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: FirestoreTs;
  expiresAt: FirestoreTs;
};

// Deprecated / UI-only types
export type RecentActivityType = 'sale' | 'payment';

export type RecentActivity = {
  id: string;
  name: string;
  type: RecentActivityType;
  amount: number;
  date: string;
};

// DEPRECATED TYPES
export type ClientLoan = any;
export type SupplierPayment = any;
export type ClientTransaction = any;

