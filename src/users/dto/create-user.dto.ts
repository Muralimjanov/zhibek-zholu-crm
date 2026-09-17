import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'username may only contain letters, digits, dot, underscore, hyphen',
  })
  username!: string;

  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  @MaxLength(256)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  // Requested role is validated against the caller's role server-side in
  // UsersService - never trusted directly (AUTH_SPEC.md §9).
  @IsEnum(UserRole)
  role!: UserRole;
}
