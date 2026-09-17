import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { SalesAccessService } from './sales-access.service';

@Module({
  providers: [SalesAccessService, BookingsService, ContractsService],
  controllers: [BookingsController, ContractsController],
  exports: [SalesAccessService],
})
export class SalesModule {}
