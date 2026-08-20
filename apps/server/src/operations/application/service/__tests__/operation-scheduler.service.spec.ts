import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationLifecycleGateService } from '../operation-lifecycle-gate.service';
import { OperationSchedulerService } from '../operation-scheduler.service';

const NOW = new Date('2026-08-13T01:02:03.000Z');

function acceptingGate(): OperationLifecycleGateService {
  const gate = new OperationLifecycleGateService();
  gate.open();
  return gate;
}

function makeScheduler(gate = acceptingGate()) {
  const repository = {
    findDueSchedules: vi.fn().mockResolvedValue([]),
    advanceDueSchedule: vi.fn(),
  };
  const runner = { start: vi.fn() };
  const scheduler = new OperationSchedulerService(
    { getDefinition: vi.fn(), parseInput: vi.fn() } as never,
    runner as never,
    repository as never,
    gate,
  );
  return { scheduler, repository, runner, gate };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.OPERATION_SCHEDULER_ENABLED = '1';
  process.env.OPERATION_SCHEDULER_INTERVAL_MS = '100';
});

afterEach(() => {
  delete process.env.OPERATION_SCHEDULER_ENABLED;
  delete process.env.OPERATION_SCHEDULER_INTERVAL_MS;
  vi.useRealTimers();
});

describe('OperationSchedulerService lifecycle ownership', () => {
  it('has no Nest lifecycle methods and starts/stops intake idempotently', async () => {
    const { scheduler, repository } = makeScheduler();
    expect('onModuleInit' in scheduler).toBe(false);
    expect('onModuleDestroy' in scheduler).toBe(false);

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(repository.findDueSchedules).toHaveBeenCalledTimes(1);

    scheduler.stopIntake(new Error('operation_server_shutdown'));
    scheduler.stopIntake(new Error('operation_server_shutdown'));
    await vi.advanceTimersByTimeAsync(200);
    expect(repository.findDueSchedules).toHaveBeenCalledTimes(1);
  });

  it('drains its tracked tick only until the shared deadline', async () => {
    const blocked = new Promise<never>(() => undefined);
    const { scheduler, repository } = makeScheduler();
    repository.findDueSchedules.mockReturnValue(blocked);
    const tick = scheduler.tick();
    const drain = scheduler.drainUntil(Date.now() + 100);
    await vi.advanceTimersByTimeAsync(99);
    let settled = false;
    void drain.finally(() => settled = true);
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await drain;
    expect(settled).toBe(true);
    void tick;
  });

  it('performs zero due-schedule mutations outside ACCEPTING', async () => {
    const gate = new OperationLifecycleGateService();
    const { scheduler, repository, runner } = makeScheduler(gate);
    repository.findDueSchedules.mockResolvedValue([{
      id: 'schedule-1',
      organizationId: 'organization-1',
      operationKey: 'sourcing.collect_daily_trends',
      cronExpression: '0 * * * *',
      timeZone: 'UTC',
      misfirePolicy: 'catch_up_once',
      input: {},
      enabled: true,
      nextRunAt: NOW,
      lastScheduledFor: null,
      createdByUserId: null,
      createdAt: NOW,
      updatedAt: NOW,
    }]);

    await scheduler.tick();

    expect(repository.findDueSchedules).not.toHaveBeenCalled();
    expect(runner.start).not.toHaveBeenCalled();
    expect(repository.advanceDueSchedule).not.toHaveBeenCalled();
  });

  it('does not advance a schedule after its start returns into STOPPING', async () => {
    const { scheduler, repository, runner, gate } = makeScheduler();
    repository.findDueSchedules.mockResolvedValue([{
      id: 'schedule-1',
      organizationId: 'organization-1',
      operationKey: 'sourcing.collect_daily_trends',
      cronExpression: '0 * * * *',
      timeZone: 'UTC',
      misfirePolicy: 'catch_up_once',
      input: {},
      enabled: true,
      nextRunAt: NOW,
      lastScheduledFor: null,
      createdByUserId: null,
      createdAt: NOW,
      updatedAt: NOW,
    }]);
    runner.start.mockImplementation(async () => {
      gate.beginStopping();
    });

    await scheduler.tick();

    expect(runner.start).toHaveBeenCalledOnce();
    expect(repository.advanceDueSchedule).not.toHaveBeenCalled();
  });
});
