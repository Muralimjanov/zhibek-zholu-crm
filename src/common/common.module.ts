import { Global, Module } from '@nestjs/common';
import { BusinessCalendar } from './business-calendar.service';

@Global()
@Module({
  providers: [BusinessCalendar],
  exports: [BusinessCalendar],
})
export class CommonModule {}
