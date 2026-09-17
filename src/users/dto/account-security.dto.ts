import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class StartEmailChangeDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters' })
  @MaxLength(256)
  newPassword!: string;
}
