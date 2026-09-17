import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EMAIL_CODE_ACTION_KEYS, EmailCodeAction } from './email-code-actions';

export class RequestEmailCodeDto {
  @IsIn(EMAIL_CODE_ACTION_KEYS)
  action!: EmailCodeAction;

  /**
   * Required for actions bound to a record: the same id (or YYYY-MM period
   * for accounting.period.close) that will be in the protected route.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[0-9a-fA-F-]{36}$|^\d{4}-\d{2}$/, { message: 'resourceId must be a UUID or YYYY-MM' })
  resourceId?: string;
}

export class VerifyEmailCodeDto {
  @IsString()
  @Matches(/^[0-9a-fA-F-]{36}$/, { message: 'challengeId must be a UUID' })
  challengeId!: string;

  @IsString()
  @MaxLength(32)
  code!: string;
}
