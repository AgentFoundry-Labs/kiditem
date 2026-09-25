import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiDirectJobWorkerService } from '../ai-direct-job-worker.service';
import type { AiDirectJob } from '../../../domain/direct-job/ai-direct-job-operation';

// 스케줄링(백오프 · wake · 겹침 방지 · heartbeat 주기)만 여기서 본다. job을 claim · 반영 · 재시도하는 동작은
// 실제 실행 계약 위에서 `ai-direct-job-worker.pg.integration.spec.ts`가 잠근다.
const TOKEN = '44444444-4444-4444-8444-444444444444';

function job(): AiDirectJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'image_edit',
    sourceResourceId: '33333333-3333-4333-8333-333333333333',
    payload: {
      jobType: 'image_edit',
      models: { image: 'image-model' },
      input: { image_url: 'https://storage.example.com/input.png', preset: 'custom' },
    },
    attempts: 1,
    maxAttempts: 3,
  };
}

function makeWorker(claimed: AiDirectJob | null = job()) {
  const jobs = {
    claim: vi.fn().mockResolvedValue(claimed ? { job: claimed, token: TOKEN, resultSaved: false } : null),
    heartbeat: vi.fn().mockResolvedValue('alive'),
    saveResult: vi.fn().mockResolvedValue(true),
    succeed: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(null),
  };
  const processor = {
    preflight: vi.fn().mockResolvedValue('runnable'),
    execute: vi.fn().mockResolvedValue({ image_url: 'https://storage.example.com/output.png' }),
    project: vi.fn().mockResolvedValue(undefined),
    projectFailure: vi.fn().mockResolvedValue(undefined),
  };
  const worker = new AiDirectJobWorkerService(
    jobs as never,
    processor as never,
    {
      workerEnabled: true,
      workerIntervalMs: 1_000,
      workerMaxIntervalMs: 10_000,
      workerErrorMaxIntervalMs: 30_000,
      leaseHeartbeatMs: 5_000,
      leaseMs: 60_000,
      providerTimeoutMs: 120_000,
      retryDelaysMs: [5_000, 30_000, 120_000],
    },
  );
  return { worker, jobs, processor };
}

describe('AiDirectJobWorkerService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('does not schedule from an Agent OS MCP child context', async () => {
    vi.useFakeTimers();
    const { worker, jobs } = makeWorker(null);
    (worker as unknown as { config: { workerEnabled: boolean } }).config.workerEnabled = false;

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);

    expect(jobs.claim).not.toHaveBeenCalled();
    worker.onModuleDestroy();
  });

  it('clears its local busy guard after one tick throws', async () => {
    const { worker, jobs } = makeWorker(null);
    jobs.claim
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(null);

    await expect(worker.tick()).rejects.toThrow('database unavailable');
    await expect(worker.tick()).resolves.toBe(false);
    expect(jobs.claim).toHaveBeenCalledTimes(2);
  });

  it('does not overlap two local ticks', async () => {
    let release!: () => void;
    const blocked = new Promise<null>((resolve) => {
      release = () => resolve(null);
    });
    const { worker, jobs } = makeWorker(null);
    jobs.claim.mockReturnValueOnce(blocked);

    const first = worker.tick();
    await worker.tick();
    expect(jobs.claim).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('backs empty queue polls off from one second to ten seconds', async () => {
    vi.useFakeTimers();
    const { worker, jobs } = makeWorker(null);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs.claim).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(jobs.claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(jobs.claim).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(jobs.claim).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(jobs.claim).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(jobs.claim).toHaveBeenCalledTimes(6);

    worker.onModuleDestroy();
  });

  it('backs database errors off independently to thirty seconds', async () => {
    vi.useFakeTimers();
    const { worker, jobs } = makeWorker(null);
    jobs.claim.mockRejectedValue(new Error('database unavailable'));
    vi.spyOn((worker as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs.claim).toHaveBeenCalledTimes(1);
    for (const [delay, expectedCalls] of [
      [1_000, 2],
      [2_000, 3],
      [4_000, 4],
      [8_000, 5],
      [16_000, 6],
      [30_000, 7],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(jobs.claim).toHaveBeenCalledTimes(expectedCalls);
    }

    worker.onModuleDestroy();
  });

  it('wakes immediately and resets the idle backoff', async () => {
    vi.useFakeTimers();
    const { worker, jobs } = makeWorker(null);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(3_000);
    const callsBeforeWake = jobs.claim.mock.calls.length;

    worker.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs.claim).toHaveBeenCalledTimes(callsBeforeWake + 1);
    await vi.advanceTimersByTimeAsync(999);
    expect(jobs.claim).toHaveBeenCalledTimes(callsBeforeWake + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(jobs.claim).toHaveBeenCalledTimes(callsBeforeWake + 2);

    worker.onModuleDestroy();
  });

  it('observes cancellation on the dedicated lease heartbeat interval', async () => {
    vi.useFakeTimers();
    const { worker, jobs, processor } = makeWorker();
    jobs.heartbeat.mockResolvedValueOnce('cancelled');
    let receivedSignal: AbortSignal | undefined;
    processor.execute.mockImplementationOnce(
      async (_job: AiDirectJob, signal: AbortSignal) => {
        receivedSignal = signal;
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        signal.throwIfAborted();
      },
    );

    const tick = worker.tick();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(jobs.heartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await tick;

    expect(jobs.heartbeat).toHaveBeenCalledWith(job(), TOKEN);
    expect(receivedSignal?.aborted).toBe(true);
    expect(jobs.saveResult).not.toHaveBeenCalled();
    expect(jobs.succeed).not.toHaveBeenCalled();
    expect(jobs.fail).not.toHaveBeenCalled();
  });
});
