import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';

/**
 * Route-level RBAC. Always runs AFTER JwtAuthGuard, so `request.user` is a
 * verified AuthenticatedUser, never client-supplied data (AUTH_SPEC.md §9).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('AUTH_FORBIDDEN');
    }
    return true;
  }
}
