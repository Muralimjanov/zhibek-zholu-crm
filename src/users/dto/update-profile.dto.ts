import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

// Intentionally has NO `role` field. Role changes go through a separate,
// more restricted administrative flow if/when the business requires one -
// self-service role change must never be possible (GATES.md Gate 6).
//
// No `avatarUrl` either: an arbitrary client-supplied URL would allow
// tracking pixels / mixed content / SSRF-style abuse (SECURITY_SPEC.md).
// The photo is uploaded via PUT /users/me/avatar and served privately.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName?: string;

  /** null clears the phone. */
  @ValidateIf((_, v) => v !== null)
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{5,32}$/, { message: 'phone may contain digits, spaces, + ( ) - only' })
  phone?: string | null;

  // No `email`: it can only be changed via POST /users/me/email (codes to the
  // current AND the new address) - login codes depend on it.
}
