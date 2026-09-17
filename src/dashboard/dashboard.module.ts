import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { SalesModule } from '../sales/sales.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AccountingModule, SalesModule],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
