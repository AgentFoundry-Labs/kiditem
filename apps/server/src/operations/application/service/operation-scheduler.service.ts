import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type {
  OperationSchedule,
  UpsertOperationScheduleRequest,
} from '@kiditem/shared/operations';
import { OPERATION_HANDLER_REGISTRY_PORT } from '../port/in/operation-handler-registry.port';
import { OPERATION_RUNNER_PORT } from '../port/in/operation-runner.port';
import { OPERATION_REPOSITORY_PORT } from '../port/out/repository/operation.repository.port';
import type { OperationHandlerRegistryPort } from '../port/in/operation-handler-registry.port';
import type { OperationRunnerPort } from '../port/in/operation-runner.port';
import type {
  OperationScheduleRecord,
  OperationRunRepositoryPort,
} from '../port/out/repository/operation.repository.port';
import {
  resolveOperationSchedulerEnabled,
  resolveOperationSchedulerIntervalMs,
} from './operation-runtime.config';
import { nextOccurrence } from './operation-schedule-clock';

const MISFIRE_SKIP_GRACE_MS = 60_000;

@Injectable()
export class OperationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OperationSchedulerService.name);
  private readonly enabled = resolveOperationSchedulerEnabled();
  private readonly intervalMs = resolveOperationSchedulerIntervalMs();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    @Inject(OPERATION_HANDLER_REGISTRY_PORT)
    private readonly registry: OperationHandlerRegistryPort,
    @Inject(OPERATION_RUNNER_PORT)
    private readonly runner: OperationRunnerPort,
    @Inject(OPERATION_REPOSITORY_PORT)
    private readonly repository: OperationRunRepositoryPort,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('Operation scheduler disabled (set OPERATION_SCHEDULER_ENABLED=1 to enable).');
      return;
    }
    this.intervalHandle = setInterval(() => void this.tick(), this.intervalMs);
    this.intervalHandle.unref?.();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  async list(organizationId: string): Promise<OperationSchedule[]> {
    return (await this.repository.listSchedules({ organizationId })).map((schedule) =>
      this.toWire(schedule),
    );
  }

  async upsert(input: {
    organizationId: string;
    operationKey: string;
    userId: string;
    request: UpsertOperationScheduleRequest;
  }): Promise<OperationSchedule> {
    let definition;
    try {
      definition = this.registry.getDefinition(input.operationKey);
    } catch {
      throw new NotFoundException('operation_not_found');
    }
    if (!definition.scheduleSupported) {
      throw new BadRequestException('schedule_not_supported');
    }

    let nextRunAt: Date | null = null;
    try {
      this.registry.parseInput(input.operationKey, input.request.input);
      if (input.request.enabled) {
        nextRunAt = nextOccurrence(
          input.request.cronExpression,
          input.request.timeZone,
          new Date(),
        );
      } else {
        // Disabled schedules are still syntax/timezone validated before save.
        nextOccurrence(input.request.cronExpression, input.request.timeZone, new Date());
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'invalid_operation_schedule',
      );
    }

    const schedule = await this.repository.upsertSchedule({
      organizationId: input.organizationId,
      operationKey: input.operationKey,
      cronExpression: input.request.cronExpression,
      timeZone: input.request.timeZone,
      misfirePolicy: input.request.misfirePolicy,
      input: input.request.input,
      enabled: input.request.enabled,
      nextRunAt,
      createdByUserId: input.userId,
    });
    return this.toWire(schedule);
  }

  async disable(organizationId: string, operationKey: string): Promise<OperationSchedule> {
    const schedule = await this.repository.disableSchedule({
      organizationId,
      operationKey,
    });
    if (!schedule) throw new NotFoundException('operation_schedule_not_found');
    return this.toWire(schedule);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      const schedules = await this.repository.findDueSchedules({ now, limit: 20 });
      for (const schedule of schedules) {
        await this.dispatchSchedule(schedule, now);
      }
    } catch (error) {
      this.logger.warn(
        `Operation scheduler tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.busy = false;
    }
  }

  private async dispatchSchedule(
    schedule: OperationScheduleRecord,
    now: Date,
  ): Promise<void> {
    if (!schedule.nextRunAt) return;

    const nextRunAt = nextOccurrence(schedule.cronExpression, schedule.timeZone, now);
    const isMissed = now.getTime() - schedule.nextRunAt.getTime() > MISFIRE_SKIP_GRACE_MS;
    if (!(schedule.misfirePolicy === 'skip' && isMissed)) {
      await this.runner.start({
        organizationId: schedule.organizationId,
        operationKey: schedule.operationKey,
        triggerSource: 'schedule',
        input: schedule.input,
        requestedByUserId: schedule.createdByUserId,
        idempotencyKey: `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`,
        scheduleId: schedule.id,
        scheduledFor: schedule.nextRunAt,
      });
    }

    await this.repository.advanceDueSchedule({
      organizationId: schedule.organizationId,
      scheduleId: schedule.id,
      expectedNextRunAt: schedule.nextRunAt,
      nextRunAt,
    });
  }

  private toWire(schedule: OperationScheduleRecord): OperationSchedule {
    return {
      id: schedule.id,
      operationKey: schedule.operationKey,
      cronExpression: schedule.cronExpression,
      timeZone: schedule.timeZone,
      misfirePolicy: schedule.misfirePolicy,
      input: schedule.input,
      enabled: schedule.enabled,
      nextRunAt: schedule.nextRunAt,
      lastScheduledFor: schedule.lastScheduledFor,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    } satisfies OperationSchedule;
  }
}
