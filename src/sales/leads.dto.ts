import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { BuyerConsentDto, PHONE_PATTERN } from './buyer-pii';

/** Площадь: до 2 знаков после точки, чтобы совпадать с Decimal(12,2). */
const AREA_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Форма ресепшена. Клиент называет имя, фамилию, телефон и нужную площадь —
 * это всё, что нужно, чтобы менеджер потом перезвонил.
 */
export class CreateLeadDto extends BuyerConsentDto {
  @ApiProperty({ example: 'Бакыт', description: 'Имя клиента' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Асанов', description: 'Фамилия клиента' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: '+996 555 12-34-56' })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone may contain digits, spaces, + ( ) - only' })
  phone!: string;

  @ApiProperty({ example: '60', description: 'Сколько квадратных метров нужно' })
  @IsString()
  @Matches(AREA_PATTERN, { message: 'desiredAreaSqm must be a positive number with up to 2 decimals' })
  desiredAreaSqm!: string;

  @ApiPropertyOptional({ example: 'Звонил по объявлению, просит перезвонить после 18:00' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/** Начальник продаж назначает лид менеджеру своей команды. */
export class AssignLeadDto {
  @ApiProperty({ description: 'Менеджер из команды начальника продаж' })
  @IsUUID()
  managerId!: string;
}

export class ListLeadsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional({ description: 'Только лиды этого менеджера' })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

/**
 * Превращение лида в бронь. Имя, телефон и площадь берутся из лида;
 * паспорт и согласие покупателя подтверждает менеджер при встрече —
 * без них бронь по правилам ТЗ создать нельзя.
 */
export class ConvertLeadDto extends BuyerConsentDto {
  @ApiProperty({ example: 'ID 1234567' })
  @IsString()
  @MaxLength(32)
  passportNumber!: string;

  @ApiPropertyOptional({ example: 'bakyt@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string;
}
