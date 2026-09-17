import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ConsentModule } from './consent/consent.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { isAuthThrottled } from './common/decorators/auth-throttle.decorator';
import { ConsentGuard } from './common/guards/consent.guard';
import { CommonModule } from './common/common.module';
import { FilesModule } from './files/files.module';
import { LegalModule } from './legal/legal.module';
import { SalesModule } from './sales/sales.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ReportsModule } from './reports/reports.module';
import { PayrollModule } from './payroll/payroll.module';
import { AccountingModule } from './accounting/accounting.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './health/health.module';
import { EmailCodesModule } from './email-codes/email-codes.module';
import { EmailCodeInterceptor } from './email-codes/email-code.interceptor';
import { BackupsModule } from './backups/backups.module';

@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          { name: 'default', ttl: config.throttleTtlSeconds * 1000, limit: config.throttleLimit },
          {
            name: 'auth',
            ttl: config.authThrottleTtlSeconds * 1000,
            limit: config.authThrottleLimit,
            // Only routes marked @AuthThrottle() (login, refresh).
            skipIf: (context) => !isAuthThrottled(context),
          },
        ],
      }),
    }),
    CommonModule,
    PrismaModule,
    CryptoModule,
    FilesModule,
    AuditModule,
    NotificationsModule,
    UsersModule,
    EmailCodesModule,
    AuthModule,
    ConsentModule,
    ConfirmationsModule,
    ScheduleModule.forRoot(),
    LegalModule,
    SalesModule,
    ReportsModule,
    AttendanceModule,
    PayrollModule,
    AccountingModule,
    DashboardModule,
    HealthModule,
    BackupsModule,
  ],
  providers: [
    // Every route requires authentication by default (opt-out via @Public()).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Business endpoints require accepted legal documents (current versions).
    { provide: APP_GUARD, useClass: ConsentGuard },
    // RBAC evaluated after authentication.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Global rate limiting (per-route stricter limits applied via @Throttle()).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Step-up email codes for important actions (@RequireEmailCode), checked
    // after all guards so unauthorised requests never consume a code.
    { provide: APP_INTERCEPTOR, useClass: EmailCodeInterceptor },
  ],
})
export class AppModule {}
