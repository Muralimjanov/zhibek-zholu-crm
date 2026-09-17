import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { ConsentController } from './consent.controller';

@Module({
  providers: [ConsentService],
  controllers: [ConsentController],
  exports: [ConsentService],
})
export class ConsentModule {}
