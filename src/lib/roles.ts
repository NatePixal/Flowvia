'use client';

// Single source of truth for role descriptions used in the UI
export const ROLE_ACCESS: Record<string, { description: string; permissions: string[] }> = {
  developer: {
    description: "roles.developer_description",
    permissions: [
      "roles.developer_perm1",
      "roles.developer_perm2",
      "roles.developer_perm3",
    ],
  },
  admin: {
    description: "roles.admin_description",
    permissions: [
      "roles.admin_perm1",
      "roles.admin_perm2",
      "roles.admin_perm3",
    ],
  },
  manager: {
    description: "roles.manager_description",
    permissions: [
      "roles.manager_perm1",
      "roles.manager_perm2",
      "roles.manager_perm3",
      "roles.manager_perm4",
    ],
  },
  sales: {
    description: "roles.sales_description",
    permissions: [
      "roles.sales_perm1",
      "roles.sales_perm2",
      "roles.sales_perm3",
      "roles.sales_perm4",
    ],
  },
  accounting: {
    description: "roles.accounting_description",
    permissions: [
      "roles.accounting_perm1",
      "roles.accounting_perm2",
      "roles.accounting_perm3",
      "roles.accounting_perm4",
    ],
  },
};
