import { Module } from '@nestjs/common';
import { ConfirmationsService } from './confirmations.service';
import { ConfirmationsController } from './confirmations.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [ConfirmationsService],
  controllers: [ConfirmationsController],
  exports: [ConfirmationsService],
})
export class ConfirmationsModule {}
