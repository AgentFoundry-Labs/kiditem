import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService } from '../prisma/prisma.service';
import { RulesService } from './rules.service';

const SCHEDULE_KEY = 'rules.evaluation.schedule';
const DEFAULT_SCHEDULE = 'twice_daily';

const SCHEDULE_CRONS: Record<string, string[]> = {
  once_daily: ['0 9 * * *'],
  twice_daily: ['0 9 * * *', '0 18 * * *'],
  four_times_daily: ['0 6 * * *', '0 12 * * *', '0 18 * * *', '0 0 * * *'],
  disabled: [],
};

@Injectable()
export class RulesSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(RulesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rulesService: RulesService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    const schedule = await this.getSchedule();
    this.applyCrons(schedule);
  }

  async getSchedule(): Promise<string> {
    const company = await this.prisma.company.findFirst({ select: { id: true } });
    if (!company) return DEFAULT_SCHEDULE;

    const setting = await this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId: company.id, key: SCHEDULE_KEY } },
    });
    return setting?.value ?? DEFAULT_SCHEDULE;
  }

  async setSchedule(schedule: string): Promise<{ schedule: string; crons: string[] }> {
    if (!SCHEDULE_CRONS[schedule]) {
      throw new Error(`Invalid schedule: ${schedule}. Valid: ${Object.keys(SCHEDULE_CRONS).join(', ')}`);
    }

    const company = await this.prisma.company.findFirst({ select: { id: true } });
    if (!company) throw new Error('No company found');

    await this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId: company.id, key: SCHEDULE_KEY } },
      update: { value: schedule },
      create: { companyId: company.id, key: SCHEDULE_KEY, value: schedule },
    });

    this.applyCrons(schedule);
    this.logger.log(`Schedule updated to: ${schedule}`);

    return { schedule, crons: SCHEDULE_CRONS[schedule] };
  }

  getScheduleOptions() {
    return Object.entries(SCHEDULE_CRONS).map(([key, crons]) => ({
      key,
      label: this.scheduleLabel(key),
      crons,
    }));
  }

  private scheduleLabel(key: string): string {
    const labels: Record<string, string> = {
      once_daily: '1회/일 (오전 9시)',
      twice_daily: '2회/일 (오전 9시, 오후 6시)',
      four_times_daily: '4회/일 (6시간 간격)',
      disabled: '비활성화 (수동 실행만)',
    };
    return labels[key] ?? key;
  }

  private applyCrons(schedule: string) {
    this.clearExistingJobs();
    const crons = SCHEDULE_CRONS[schedule] ?? [];

    crons.forEach((cron, idx) => {
      const jobName = `rules-eval-${idx}`;
      const job = new CronJob(cron, () => this.runEvaluation(), null, true, 'Asia/Seoul');
      this.schedulerRegistry.addCronJob(jobName, job);
      this.logger.log(`Registered cron job ${jobName}: ${cron}`);
    });

    if (crons.length === 0) {
      this.logger.log('Schedule disabled — manual evaluation only');
    }
  }

  private clearExistingJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((_, name) => {
      if (name.startsWith('rules-eval-')) {
        this.schedulerRegistry.deleteCronJob(name);
      }
    });
  }

  private async runEvaluation() {
    this.logger.log('Scheduled rules evaluation starting...');
    try {
      const company = await this.prisma.company.findFirst({ select: { id: true } });
      if (!company) {
        this.logger.warn('No company found — skipping scheduled evaluation');
        return;
      }
      const result = await this.rulesService.evaluateAll(company.id);
      this.logger.log(
        `Scheduled evaluation complete: ${result.total} products, ${result.violationCount} violations (${result.critical} critical)`,
      );
    } catch (error) {
      this.logger.error('Scheduled evaluation failed:', error);
    }
  }
}
