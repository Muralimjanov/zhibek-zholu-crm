import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ConsentPolicyType } from '@prisma/client';

export class RecordConsentDto {
  @IsEnum(ConsentPolicyType)
  policyType!: ConsentPolicyType;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  policyVersion!: string;
}
