
# Welcome to FlowVia: Your All-in-One Business Command Center

This guide provides a comprehensive walkthrough of every feature within the FlowVia application. Use this manual to get started, train your team, and maximize your business's efficiency.

---

## 1. Getting Started: Authentication & User Roles

FlowVia is built for teams, with a secure system for managing user access.

### Signing Up & Logging In
- **First-Time Admin:** If you are the first person from your company to use the app, navigate to the **Sign Up** tab. When you create your account, the system will automatically provision a new company for you and assign you the **Admin** role.
- **Invited Users:** If you have been invited to join an existing company, your administrator will provide you with an email and a temporary password. Use these credentials to log in on the **Sign In** tab.
- **Secure Password Reset:** If you forget your password, you can use the "Forgot Password?" link on the sign-in page to securely reset it via email.

### User Roles & Permissions
FlowVia uses a powerful role-based system to ensure data security and operational integrity.
- **Developer:** Has unrestricted, system-wide access for maintenance and troubleshooting.
- **Admin:** Has full control over their own company's data, settings, and users. An admin can invite, manage, and assign roles to other users.
- **Manager:** Can oversee most daily operations—managing inventory, sales, expenses, and employees—but cannot change company settings or manage other users' access.
- **Sales:** A focused role with permissions to view inventory, create products, and record sales.
- **Accounting:** A financially-focused role that can manage expenses and view sales records but cannot alter inventory or create sales.

---

## 2. The Dashboard: Your Business at a Glance

The Dashboard is your mission control, offering a real-time, high-level view of your business's vital signs.

- **Sales Performance:** A dynamic area chart visualizes your sales trends over the past week, helping you spot patterns and momentum instantly.
- **Financial Overview:** This dual chart tracks your cumulative gross profit against your total expenses, showing your net financial trajectory. Below it, an interactive pie chart breaks down your spending by category (e.g., salary, rent, utilities), revealing exactly where your money is going.
- **Inventory Operations:** A bar chart displays your most-stocked products, while a progress gauge shows your current warehouse storage usage, helping you manage space effectively.
- **Global Stats:** At-a-glance cards show your total number of orders, total expenses in your chosen currency, and your overall net profit.

---

## 3. Core Operations Modules

These modules are the heart of your daily business activities.

### Inventory & Incoming Stock
- **Add a Product:** On the **Inventory** page, click **Add Product** to create a new item in your catalog. You can define its unique product code, name, category, purchase price, selling price, and more.
- **Receive Stock:** On the **Daily Incoming** page, you can log new stock arrivals.
  - **Existing Product:** Enter the product code, and the system will auto-fill the details. Simply input the quantity received and the new unit cost. The system automatically recalculates the average cost for that product, ensuring your inventory valuation is always accurate.
  - **New Product:** If the product code is new, you'll be prompted to fill in the details to create it on the fly.
  - **Bulk Import:** Use the **Import File** button to upload a `.csv` or `.xlsx` file for mass stock updates, saving you hours of manual entry.

### Sales & Client Receivables
- **Record a Sale:** On the **Sales** page, click **Record Sale**. The form allows you to select the client, product, and seller. When you enter the quantity and sale price, the system calculates the total.
- **Payment Types:**
  - **Cash:** A standard cash transaction.
  - **Loan:** This is the critical feature for managing receivables. When "Loan" is selected, the sale amount is automatically added to the client's outstanding balance in the **Client Loans** module.
  - **Partial:** (For future implementation).
- **Automated Updates:** Recording a sale instantly updates your inventory stock levels and financial analytics.

### Client Loans Management
- **Centralized View:** The **Client Loans** page lists all clients with outstanding balances.
- **Make a Payment:** When a client pays off their debt, use the **Make Payment** button to record the repayment, which automatically updates their balance.
- **Detailed History:** For any client, click the **Eye icon** to open a side sheet displaying their complete transaction history—every loan and every repayment—in a clear, easy-to-read ledger.

### Expense & Payroll Management
- **Log an Expense:** On the **Expenses** page, you can log any business expenditure. Select the expense type (e.g., Rent, Utilities, Food), enter the amount, and provide a description.
- **Manage Employees:** First, add your staff on the **Employees** page, defining their role and default salary.
- **Pay Salaries:** To pay a salary, go to the **Expenses** page, select the **Salary** expense type, and choose the employee you are paying. The expense is automatically logged and associated with them for clear financial tracking.

---

## 4. Administration & Settings

As an Admin, you have access to powerful tools to configure your company and manage your team.

### User Management (Admin Panel)
- **Direct User Creation:** Navigate to the **Admin** section and click **Invite Users**. You can directly create a new user account by filling in their name, email, and a temporary password, then assigning them a role.
- **Secure Credential Sharing:** After creating an account, you must securely share the generated password with the new user. They will be prompted to change it upon their first login.
- **Permissions Management:** In the **Settings -> Permissions** tab, you can easily change the roles of existing users (except for Developers or your own Admin account).

### Company & Profile Settings
- **Company Settings:** On the **Settings** page, you can update your company's name and define your warehouse's total storage capacity.
- **Profile Settings:** Any user can update their personal information, such as their name and phone number.
- **Security:** Users can change their own password at any time from the security settings tab.

---

## 5. Advanced System-Wide Features

- **Multi-Language Interface:** The entire application can be switched between **English** and **Russian** with a single click from the header menu.
- **Multi-Currency Support:** All financial figures can be displayed in **USD**, **AED**, or **UZS**. The system handles all conversions automatically based on predefined exchange rates, but displays values in their originally recorded currency in transaction logs.
- **Responsive Design:** FlowVia works seamlessly on desktop, tablet, and mobile devices, so you can manage your business from anywhere.
- **Light & Dark Mode:** Choose the visual theme that works best for you. The app will respect your system preference by default but can be overridden.
- **Data Export:** Most data tables (Sales, Expenses, Client Loans) include an **Export** button, allowing you to download your data as a `.csv` file for offline analysis or use in other programs.
