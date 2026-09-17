import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function buildContext(user: any, requiredRoles: UserRole[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn(() => requiredRoles),
  } as unknown as Reflector;

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;

  return { context, reflector };
}

describe('RolesGuard', () => {
  it('allows the request through when no @Roles() metadata is present', () => {
    const { context, reflector } = buildContext({ role: UserRole.investor }, undefined);
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user whose role is in the required list', () => {
    const { context, reflector } = buildContext(
      { role: UserRole.director },
      [UserRole.director],
    );
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a user whose role is not in the required list', () => {
    const { context, reflector } = buildContext(
      { role: UserRole.investor },
      [UserRole.director],
    );
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user at all', () => {
    const { context, reflector } = buildContext(undefined, [UserRole.director]);
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
