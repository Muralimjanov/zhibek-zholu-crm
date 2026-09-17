import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { SalesModule } from '../sales/sales.module';
import { DayOffsController, ShiftsController } from './attendance.controller';
import { DayOffsService } from './day-offs.service';
import { MissedShiftsService } from './missed-shifts.service';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [ReportsModule, SalesModule],
  providers: [ShiftsService, DayOffsService, MissedShiftsService],
  controllers: [ShiftsController, DayOffsController],
  exports: [MissedShiftsService],
})
export class AttendanceModule {}
