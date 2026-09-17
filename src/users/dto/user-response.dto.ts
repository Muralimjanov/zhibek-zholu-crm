import { UserRole, UserStatus } from '@prisma/client';

export interface UserResponseSource {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  hasAvatar: boolean;
  role: UserRole;
  status: UserStatus;
  teamLeadId: string | null;
  createdAt: Date;
}

/**
 * Whitelisted response shape. Never includes passwordHash or any internal
 * security field, regardless of what Prisma returns (data minimization -
 * SECURITY_SPEC.md / GATES.md Gate 7). Built only via UsersService.toResponse,
 * which decrypts PII.
 */
export class UserResponseDto {
  id!: string;
  username!: string;
  fullName!: string;
  phone!: string | null;
  email!: string | null;
  /** API path (relative to the API prefix) of the avatar, or null. */
  avatarUrl!: string | null;
  role!: UserRole;
  status!: UserStatus;
  teamLeadId!: string | null;
  createdAt!: Date;

  static from(source: UserResponseSource): UserResponseDto {
    return {
      id: source.id,
      username: source.username,
      fullName: source.fullName,
      phone: source.phone,
      email: source.email,
      avatarUrl: source.hasAvatar ? `users/${source.id}/avatar` : null,
      role: source.role,
      status: source.status,
      teamLeadId: source.teamLeadId,
      createdAt: source.createdAt,
    };
  }
}
