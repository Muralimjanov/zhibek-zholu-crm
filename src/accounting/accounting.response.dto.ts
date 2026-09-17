import { ApiProperty } from '@nestjs/swagger';
import { TransactionCategory, TransactionType } from '@prisma/client';

/** Documented shape of AccountingService.toResponse (money: tyiyn strings). */
export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: TransactionType }) type!: TransactionType;
  @ApiProperty({ enum: TransactionCategory }) category!: TransactionCategory;
  @ApiProperty({ nullable: true, example: null }) subcategory!: string | null;
  @ApiProperty({ example: '1500050', description: 'Тыйын, целое число строкой (15 000,50 сом)' }) amountTyiyn!: string;
  @ApiProperty({ example: 'KGS' }) currency!: string;
  @ApiProperty({ example: '2026-09-18', description: 'YYYY-MM-DD' }) date!: string;
  @ApiProperty({ nullable: true, description: 'Хранится зашифрованным', example: 'Счёт за электричество' }) comment!: string | null;
  @ApiProperty({ description: 'Файл чека загружен; скачивание — GET /transactions/{id}/attachment' }) hasAttachment!: boolean;
  @ApiProperty({ format: 'uuid', nullable: true }) relatedContractId!: string | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiProperty({ description: 'Месяц операции закрыт: правка и удаление бухгалтером запрещены' }) periodClosed!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class TransactionPageDto {
  @ApiProperty({ type: [TransactionResponseDto] }) items!: TransactionResponseDto[];
  @ApiProperty({ example: 42 }) total!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 0 }) offset!: number;
}

export class CategoryTotalDto {
  @ApiProperty({ enum: TransactionCategory }) category!: TransactionCategory;
  @ApiProperty({ example: 'Коммунальные расходы объекта' }) label!: string;
  @ApiProperty({ enum: TransactionType }) type!: TransactionType;
  @ApiProperty({ example: 3 }) count!: number;
  @ApiProperty({ example: '4500000' }) amountTyiyn!: string;
}

export class AccountingSummaryDto {
  @ApiProperty({ example: '2026-09-01' }) from!: string;
  @ApiProperty({ example: '2026-09-30' }) to!: string;
  @ApiProperty({ example: '90000000' }) incomeTyiyn!: string;
  @ApiProperty({ example: '4500000' }) expenseTyiyn!: string;
  @ApiProperty({ example: '85500000', description: 'Приходы − расходы; может быть отрицательным' }) netTyiyn!: string;
  @ApiProperty({ type: [CategoryTotalDto], description: 'Все 14 категорий, включая нулевые' }) byCategory!: CategoryTotalDto[];
}

export class AccountingPeriodDto {
  @ApiProperty({ example: '2026-08', description: 'YYYY-MM' }) period!: string;
  @ApiProperty() closedAt!: string;
  @ApiProperty({ format: 'uuid' }) closedById!: string;
}
