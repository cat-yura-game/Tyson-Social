import { describe, expect, it } from 'vitest';
import { canAccessAdminApi, canMutateOwnedResource } from '../src/security/authorization';

describe('authorization rules', () => {
  it('prevents IDOR mutations against another user resource', () => {
    expect(canMutateOwnedResource({ userId: 'user-a', role: 'user', status: 'active' }, 'user-b')).toBe(false);
  });

  it('does not trust a non-admin account for admin access', () => {
    expect(canAccessAdminApi({ userId: 'user-a', role: 'moderator', status: 'active' })).toBe(false);
  });

  it('rejects suspended admins', () => {
    expect(canAccessAdminApi({ userId: 'admin-a', role: 'admin', status: 'suspended' })).toBe(false);
  });
});
