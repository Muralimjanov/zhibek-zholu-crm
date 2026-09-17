import { UserRole } from '@prisma/client';

/**
 * Minimal shape derived from a verified access token. Never includes
 * password hash, tokens, or unnecessary PII (JWT claims are intentionally
 * minimal - AUTH_SPEC.md §6).
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
}
