import { hasPermission } from '../permissions';
import type { UserProfile } from '../types';

const baseUser: UserProfile = {
  id: 'u1',
  uid: 'u1',
  email: 'user@example.com',
  name: 'User',
  companyId: 'company1',
  role: 'sales',
  isPaid: true,
  status: 'active',
  createdAt: {} as any,
};

describe('role permissions', () => {
  it('allows sales users to create sales without granting expense access', () => {
    expect(hasPermission(baseUser, 'sales', 'create')).toBe(true);
    expect(hasPermission(baseUser, 'expenses', 'create')).toBe(false);
  });

  it('treats company admins as company-wide operators', () => {
    expect(hasPermission({ ...baseUser, role: 'admin' }, 'users', 'create')).toBe(true);
    expect(hasPermission({ ...baseUser, role: 'admin' }, 'company', 'edit')).toBe(true);
  });

  it('does not grant permissions to missing profiles', () => {
    expect(hasPermission(null, 'sales', 'create')).toBe(false);
  });

  it('does not grant permissions to blocked users', () => {
    expect(hasPermission({ ...baseUser, status: 'blocked' }, 'sales', 'create')).toBe(false);
  });
});
