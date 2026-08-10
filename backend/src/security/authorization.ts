export type AccountRole = 'user' | 'moderator' | 'admin';
export type AccountStatus = 'pending_email' | 'active' | 'limited' | 'suspended' | 'deleted';

export interface Principal {
  userId: string;
  role: AccountRole;
  status: AccountStatus;
}

export function canUseAuthenticatedApi(principal: Principal): boolean {
  return principal.status === 'active' || principal.status === 'limited';
}

export function canMutateOwnedResource(principal: Principal, ownerUserId: string): boolean {
  return canUseAuthenticatedApi(principal) && principal.userId === ownerUserId;
}

export function canAccessAdminApi(principal: Principal): boolean {
  return principal.status === 'active' && principal.role === 'admin';
}
