import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';

/**
 * Row-level scope for Booking/Contract from the TZ_CRM_DEV_v2 CRUD matrix:
 *   director       - "Всё" (every record)
 *   head_of_sales  - "Команда" (records of their team + their own)
 *   sales_manager  - "Своё" (only records where they are the manager)
 *   accountant / investor - no access to buyer PII (aggregates only)
 *
 * Every read/write query is built through `managerScope`, so an id taken
 * from another team simply is not found (404) - no IDOR by guessing ids.
 */
@Injectable()
export class SalesAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Prisma `where` fragment restricting records by managerId. */
  async managerScope(actor: AuthenticatedUser): Promise<{ managerId?: { in: string[] } }> {
    switch (actor.role) {
      case UserRole.director:
        return {};
      case UserRole.head_of_sales:
        return { managerId: { in: [actor.id, ...(await this.teamIds(actor.id))] } };
      case UserRole.sales_manager:
        return { managerId: { in: [actor.id] } };
      default:
        throw new ForbiddenException('AUTH_FORBIDDEN');
    }
  }

  async teamIds(teamLeadId: string): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { teamLeadId, role: UserRole.sales_manager },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Who the record is assigned to. A sales manager always gets themselves
   * (a managerId in the body is ignored-by-rejection); a head of sales may
   * pick themselves or a team member; a director any active seller.
   */
  async resolveManagerId(actor: AuthenticatedUser, requested: string | undefined): Promise<string> {
    if (actor.role === UserRole.sales_manager) {
      if (requested !== undefined && requested !== actor.id) throw new ForbiddenException('AUTH_FORBIDDEN');
      return actor.id;
    }
    if (actor.role === UserRole.head_of_sales) {
      const target = requested ?? actor.id;
      if (target !== actor.id && !(await this.teamIds(actor.id)).includes(target)) {
        throw new ForbiddenException('AUTH_FORBIDDEN');
      }
      return this.assertActiveSeller(target);
    }
    if (actor.role === UserRole.director) {
      if (!requested) throw new BadRequestException('MANAGER_ID_REQUIRED');
      return this.assertActiveSeller(requested);
    }
    throw new ForbiddenException('AUTH_FORBIDDEN');
  }

  private async assertActiveSeller(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const sellerRoles: UserRole[] = [UserRole.sales_manager, UserRole.head_of_sales];
    if (!user || user.status !== UserStatus.active || !sellerRoles.includes(user.role)) {
      throw new BadRequestException('MANAGER_INVALID');
    }
    return user.id;
  }
}
