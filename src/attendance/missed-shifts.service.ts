import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AuditResult, ShiftStatus, UserStatus } from '@prisma/client';
import { CronJob } from 'cron';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/audit.types';
import { BusinessCalendar, IsoDate, toDbDate } from '../common/business-calendar.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { SHIFT_ROLES } from './attendance-access';

const JOB_NAME = 'record-missed-shifts';

/**
 * TZ: "Фоновая задача (cron) в начале следующего рабочего дня проверяет,
 * есть ли Shift за прошедший рабочий день у каждого сотрудника с кнопкой
 * смены. Если Shift не создан и нет DayOff - статус missed."
 *
 * - Runs daily at 00:05 BUSINESS_TIMEZONE and once at startup.
 * - Re-checks the last MISSED_SHIFT_LOOKBACK_DAYS days, so days are not lost
 *   if the server was down at midnight.
 * - Idempotent: a unique (userId, date) constraint + skipDuplicates means
 *   several app instances running the job at once cannot double-record.
 */
@Injectable()
export class MissedShiftsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MissedShiftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: BusinessCalendar,
    private readonly config: AppConfigService,
    private readonly scheduler: SchedulerRegistry,
    private readonly audit: AuditService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.cronEnabled) return;
    const job = new CronJob('0 5 0 * * *', () => void this.runSafely(), null, false, this.config.businessTimezone);
    this.scheduler.addCronJob(JOB_NAME, job);
    job.start();
    void this.runSafely();
  }

  onModuleDestroy(): void {
    if (this.scheduler.doesExist('cron', JOB_NAME)) this.scheduler.deleteCronJob(JOB_NAME);
  }

  private async runSafely(): Promise<void> {
    try {
      const created = await this.catchUp();
      if (created > 0) this.logger.log(`Recorded ${created} missed shift(s)`);
    } catch (err) {
      this.logger.error(`Missed-shift job failed: ${(err as Error).message}`);
    }
  }

  /** Checks every past working day in the lookback window. Returns rows created. */
  async catchUp(now: Date = new Date()): Promise<number> {
    const today = this.calendar.today(now);
    let total = 0;
    for (const day of this.calendar.pastWorkingDays(today, this.config.missedShiftLookbackDays)) {
      total += await this.recordMissedFor(day);
    }
    return total;
  }

  /** Records `missed` for one past working day. Never touches today or the future. */
  async recordMissedFor(date: IsoDate): Promise<number> {
    if (date >= this.calendar.today() || !this.calendar.isWorkingDay(date)) return 0;
    const dbDate = toDbDate(date);
    const { start } = this.calendar.dayBounds(date);

    const employees = await this.prisma.user.findMany({
      where: {
        role: { in: SHIFT_ROLES },
        status: UserStatus.active,
        // Accounts created on or after that day are not penalised for it.
        createdAt: { lt: start },
        shifts: { none: { date: dbDate } },
        dayOffs: { none: { date: dbDate } },
      },
      select: { id: true },
    });
    if (employees.length === 0) return 0;

    const result = await this.prisma.shift.createMany({
      data: employees.map((e) => ({ userId: e.id, date: dbDate, status: ShiftStatus.missed })),
      skipDuplicates: true,
    });
    if (result.count > 0) {
      await this.audit.record({
        action: AuditAction.SHIFT_MISSED_RECORDED,
        entityType: 'Shift',
        result: AuditResult.success,
        metadata: { date, count: result.count },
      });
    }
    return result.count;
  }
}
