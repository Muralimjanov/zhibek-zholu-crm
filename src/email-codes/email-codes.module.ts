import { Global, Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { EmailCodesController } from './email-codes.controller';
import { EmailCodesService } from './email-codes.service';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [EmailCodesController],
  providers: [EmailCodesService],
  exports: [EmailCodesService],
})
export class EmailCodesModule {
  constructor(users: UsersService, codes: EmailCodesService) {
    // UsersService (email change) needs codes, and this module needs
    // UsersModule - wire the reference here instead of a module import cycle.
    users.emailCodes = codes;
  }
}
