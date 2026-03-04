import type { UserProfile, UserRole } from '@/lib/types';

export type Permission = 'view' | 'create' | 'edit' | 'delete' | 'refund' | 'export' | 'import';
export type Resource = 'dashboard' | 'products' | 'sales' | 'clients' | 'suppliers' | 'sellers' | 'expenses' | 'employees' | 'users' | 'company' | 'admin' | 'developer' | 'locations' | 'shops' | 'pos' | 'transfers' | 'stocktake' | 'exports' | 'telegram';

export const ROLE_PERMISSIONS: Record<UserRole, Partial<Record<Resource, Permission[]>>> = {
  developer: {
    // All access is implicitly granted
  },
  admin: {
    // All access is implicitly granted within the company
  },
  manager: {
    dashboard: ['view'],
    products: ['view', 'create', 'edit', 'delete', 'export', 'import'],
    sales: ['view', 'create', 'refund', 'export', 'import'],
    expenses: ['view', 'create', 'edit', 'delete', 'export', 'import'],
    suppliers: ['view', 'create', 'edit', 'delete', 'export', 'import'],
    employees: ['view', 'create', 'edit', 'delete', 'export', 'import'],
    clients: ['view', 'create', 'edit', 'delete', 'export', 'import'],
    sellers: ['view', 'create', 'edit', 'delete'],

    locations: ['view', 'create', 'edit', 'delete'],
    shops: ['view'],
    pos: ['view', 'create'],
    transfers: ['view', 'create'],
    stocktake: ['view', 'create'],
    exports: ['view', 'export'],
    telegram: ['view', 'edit'],
  },
  sales: {
    dashboard: ['view'],
    products: ['view', 'create', 'edit'],
    sales: ['view', 'create'],
    clients: ['view', 'create', 'edit'],
    sellers: ['view'],

    pos: ['view', 'create'],
    transfers: ['view'],
    stocktake: ['view'],
  },
  accounting: {
    dashboard: ['view'],
    expenses: ['view', 'create', 'edit', 'delete'],
    clients: ['view'],
    sales: ['view'],
    suppliers: ['view'],

    locations: ['view'],
    shops: ['view'],
    transfers: ['view', 'create'],
    stocktake: ['view'],
    exports: ['view', 'export'],
    telegram: ['view', 'edit'],
  },
};


export function hasPermission(
  userProfile: UserProfile | null,
  resource: Resource,
  permission: Permission
): boolean {
  if (!userProfile || !userProfile.role) return false;

  // Developer and Admin roles have super-access
  if (userProfile.role === 'developer' || userProfile.role === 'admin') {
    return true;
  }
  
  const rolePermissions = ROLE_PERMISSIONS[userProfile.role];
  if (!rolePermissions) return false;
  
  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) return false;

  return resourcePermissions.includes(permission);
}
