import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { SalesAccessService } from './sales-access.service';

@Module({
  providers: [SalesAccessService, BookingsService, ContractsService, LeadsService],
  controllers: [BookingsController, ContractsController, LeadsController],
  exports: [SalesAccessService],
})
export class SalesModule {}
