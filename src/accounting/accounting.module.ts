import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  providers: [AccountingService],
  controllers: [AccountingController],
  exports: [AccountingService],
})
export class AccountingModule {}
