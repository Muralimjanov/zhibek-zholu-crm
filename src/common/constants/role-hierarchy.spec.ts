import { UserRole } from '@prisma/client';
import { canCreateRole, ROLE_CREATION_MATRIX } from './role-hierarchy';

describe('role creation matrix', () => {
  it('director can create head_of_sales, accountant, and investor', () => {
    expect(canCreateRole(UserRole.director, UserRole.head_of_sales)).toBe(true);
    expect(canCreateRole(UserRole.director, UserRole.accountant)).toBe(true);
    expect(canCreateRole(UserRole.director, UserRole.investor)).toBe(true);
  });

  it('director cannot create another director (not in TЗ)', () => {
    expect(canCreateRole(UserRole.director, UserRole.director)).toBe(false);
  });

  it('director cannot directly create a sales_manager (that is head_of_sales scope)', () => {
    expect(canCreateRole(UserRole.director, UserRole.sales_manager)).toBe(false);
  });

  it('head_of_sales can only create sales_manager', () => {
    expect(canCreateRole(UserRole.head_of_sales, UserRole.sales_manager)).toBe(true);
    expect(canCreateRole(UserRole.head_of_sales, UserRole.director)).toBe(false);
    expect(canCreateRole(UserRole.head_of_sales, UserRole.accountant)).toBe(false);
    expect(canCreateRole(UserRole.head_of_sales, UserRole.investor)).toBe(false);
  });

  it('sales_manager cannot create anyone (privilege escalation attempt)', () => {
    for (const target of Object.values(UserRole)) {
      expect(canCreateRole(UserRole.sales_manager, target)).toBe(false);
    }
  });

  it('accountant cannot create anyone (privilege escalation attempt)', () => {
    for (const target of Object.values(UserRole)) {
      expect(canCreateRole(UserRole.accountant, target)).toBe(false);
    }
  });

  it('investor cannot create anyone, including another investor (privilege escalation attempt)', () => {
    for (const target of Object.values(UserRole)) {
      expect(canCreateRole(UserRole.investor, target)).toBe(false);
    }
  });

  it('matrix has an explicit entry for every role (no silent fallthrough)', () => {
    expect(Object.keys(ROLE_CREATION_MATRIX).sort()).toEqual(Object.values(UserRole).sort());
  });
});
