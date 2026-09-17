import { UserRole } from '@prisma/client';

/**
 * Which roles a given role is allowed to create. Source: AUTH_SPEC.md §9
 * "Role creation matrix" / TZ_CRM_DEV_v2 role descriptions.
 *
 * sales_manager, accountant, investor create nobody (empty arrays).
 */
export const ROLE_CREATION_MATRIX: Record<UserRole, UserRole[]> = {
  [UserRole.director]: [UserRole.head_of_sales, UserRole.accountant, UserRole.investor],
  [UserRole.head_of_sales]: [UserRole.sales_manager],
  [UserRole.sales_manager]: [],
  [UserRole.accountant]: [],
  [UserRole.investor]: [],
};

export function canCreateRole(creatorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_CREATION_MATRIX[creatorRole]?.includes(targetRole) ?? false;
}
