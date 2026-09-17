import { UserRole } from '@prisma/client';

/** TZ: the "Открыть/Завершить смену" button exists only for these roles. */
export const SHIFT_ROLES: UserRole[] = [UserRole.head_of_sales, UserRole.sales_manager, UserRole.accountant];

export function hasShiftButton(role: UserRole): boolean {
  return SHIFT_ROLES.includes(role);
}
