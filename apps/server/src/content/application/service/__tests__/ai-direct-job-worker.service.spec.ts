import { afterEach, describe, expect, it, vi } from 'vitest';
import { KiditemExternalError } from '@kiditem/shared/errors';
import { AiDirectJobWorkerService } from '../ai-direct-job-worker.service';
import type { AiDirectJobRecord } from '../../port/out/repository/ai-direct-job.repository.port';

const NOW = new Date('2026-07-19T00:00:00.000Z');

function job(overrides: Partial<AiDirectJobRecord> = {}): AiDirectJobRecord & {
  claimedFromStatus: AiDirectJobRecord['status'];
} {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'image_edit',
    sourceResourceId: '33333333-3333-4333-8333-333333333333',
    status: 'running',
    payload: {
      jobType: 'image_edit',
      models: { image: 'image-model' },
      input: {
        image_url: 'https://storage.example.com/input.png',
        preset: 'custom',
      },
    },
    result: null,
    attempts: 1,
    maxAttempts: 3,
    scheduledFor: NOW,
    claimedAt: NOW,
    claimedBy: 'worker-test',
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: NOW,
    updatedAt: NOW,
    claimedFromStatus: 'pending',
    ...overrides,
  };
}

function makeWorker(claimed: ReturnType<typeof job> | null = job()) {
  const repository = {
    claimNext: vi.fn().mockResolvedValue(claimed),
    checkpointResult: vi.fn().mockResolvedValue(true),
    markSucceeded: vi.fn().mockResolvedValue(true),
    failOrReschedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(claimed),
    extendLease: vi.fn().mockResolvedValue('running'),
    findById: vi.fn().mockResolvedValue(
      claimed ? { ...claimed, status: 'projecting' } : null,
    ),
  };
  const processor = {
    preflight: vi.fn().mockResolvedValue('runnable'),
    execute: vi.fn().mockResolvedValue({
      image_url: 'https://storage.example.com/output.png',
    }),
    project: vi.fn().mockResolvedValue(undefined),
    projectFailure: vi.fn().mockResolvedValue(undefined),
  };
  const worker = new AiDirectJobWorkerService(
    repository as never,
    processor as never,
    {
      workerEnabled: true,
      workerIntervalMs: 1_000,
      workerMaxIntervalMs: 10_000,
      workerErrorMaxIntervalMs: 30_000,
      leaseHeartbeatMs: 5_000,
      leaseMs: 60_000,
      providerTimeoutMs: 120_000,
      heldRecoveryMs: 30_000,
      retryDelaysMs: [5_000, 30_000, 120_000],
    },
  );
  return { worker, repository, processor };
}

describe('AiDirectJobWorkerService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('executes, checkpoints, projects, and succeeds', async () => {
    const { worker, repository, processor } = makeWorker();

    await worker.tick(NOW);

    expect(processor.execute).toHaveBeenCalled();
    expect(repository.checkpointResult).toHaveBeenCalledWith({
      organizationId: job().organizationId,
      jobId: job().id,
      result: { image_url: 'https://storage.example.com/output.png' },
    });
    expect(processor.project).toHaveBeenCalled();
    expect(repository.markSucceeded).toHaveBeenCalled();
  });

  it('does not schedule from an Agent OS MCP child context', async () => {
    vi.useFakeTimers();
    const { worker, repository } = makeWorker(null);
    (worker as unknown as { config: { workerEnabled: boolean } }).config.workerEnabled = false;

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);

    expect(repository.claimNext).not.toHaveBeenCalled();
    worker.onModuleDestroy();
  });

  it('reuses a checkpoint without calling the provider again', async () => {
    const checkpoint = { image_url: 'https://storage.example.com/output.png' };
    const { worker, repository, processor } = makeWorker(
      job({ status: 'projecting', result: checkpoint }),
    );

    await worker.tick(NOW);

    expect(processor.execute).not.toHaveBeenCalled();
    expect(repository.checkpointResult).not.toHaveBeenCalled();
    expect(processor.project).toHaveBeenCalledWith(
      expect.objectContaining({ id: job().id }),
      checkpoint,
    );
  });

  it('projects a managed-http thumbnail checkpoint without calling the provider again', async () => {
    const checkpoint = {
      candidates: [
        {
          url: 'http://kiditem-office:9000/kiditem/thumbnail-generations/output.png',
          storageKey: 'thumbnail-generations/output.png',
        },
      ],
    };
    const { worker, repository, processor } = makeWorker(
      job({
        jobType: 'thumbnail_generate',
        status: 'projecting',
        result: checkpoint,
        payload: {
          jobType: 'thumbnail_generate',
          models: { image: 'image-model' },
          input: {
            mode: 'creative',
            inputs: [
              {
                mimeType: 'image/png',
                label: 'Product',
                url: 'https://storage.example.com/input.png',
                storageKey: 'thumbnail-inputs/input.png',
                role: 'product',
                sortOrder: 0,
                source: 'upload',
                fileSize: 3,
              },
            ],
          },
        },
      }),
    );

    await worker.tick(NOW);

    expect(processor.execute).not.toHaveBeenCalled();
    expect(repository.checkpointResult).not.toHaveBeenCalled();
    expect(processor.project).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'thumbnail_generate' }),
      checkpoint,
    );
    expect(repository.markSucceeded).toHaveBeenCalled();
  });

  it('requeues retryable provider failures with the first backoff', async () => {
    const { worker, repository, processor } = makeWorker();
    processor.execute.mockRejectedValueOnce(new Error('provider unavailable'));

    await worker.tick(NOW);

    expect(repository.failOrReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'direct_ai_execution_failed',
        retryable: true,
        retryAt: new Date(NOW.getTime() + 5_000),
      }),
    );
    expect(processor.projectFailure).not.toHaveBeenCalled();
  });

  it('keeps the stored message and logs the KiditemError details it cannot store', async () => {
    const { worker, repository, processor } = makeWorker();
    const warn = vi.spyOn((worker as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    processor.execute.mockRejectedValueOnce(new KiditemExternalError('CONTENT_GENERATION_FAILED', {
      details: { reason: 'detail_page_color_subtitle_empty' },
    }));

    await worker.tick(NOW);

    expect(repository.failOrReschedule).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: 'CONTENT_GENERATION_FAILED',
      errorMessage: 'AI 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',
    }));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('detail_page_color_subtitle_empty'));
  });

  it('rejects invalid provider output before checkpointing without retrying', async () => {
    const { worker, repository, processor } = makeWorker();
    processor.execute.mockResolvedValueOnce({});

    await worker.tick(NOW);

    expect(repository.checkpointResult).not.toHaveBeenCalled();
    expect(repository.failOrReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'direct_ai_output_invalid',
        retryable: false,
      }),
    );
    expect(processor.projectFailure).toHaveBeenCalled();
  });

  it('terminates an invalid stored checkpoint without rerunning the provider', async () => {
    const { worker, repository, processor } = makeWorker(
      job({ status: 'projecting', result: {} }),
    );

    await worker.tick(NOW);

    expect(processor.execute).not.toHaveBeenCalled();
    expect(repository.checkpointResult).not.toHaveBeenCalled();
    expect(repository.failOrReschedule).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: 'direct_ai_output_invalid',
        retryable: false,
      }),
    );
    expect(processor.projectFailure).toHaveBeenCalled();
  });

  it('fails model errors without another attempt', async () => {
    const { worker, repository, processor } = makeWorker();
    processor.execute.mockRejectedValueOnce(
      Object.assign(new Error('model missing'), { code: 'model_required' }),
    );

    await worker.tick(NOW);

    expect(repository.failOrReschedule).toHaveBeenCalledWith(
      expect.objectContaining({ retryable: false, errorCode: 'model_required' }),
    );
    expect(processor.projectFailure).toHaveBeenCalled();
  });

  it('preflights a recovered held job before provider execution', async () => {
    const { worker, processor } = makeWorker(
      job({ claimedFromStatus: 'held' }),
    );

    await worker.tick(NOW);

    expect(processor.preflight).toHaveBeenCalledBefore(processor.execute);
  });

  it('clears its local busy guard after one tick throws', async () => {
    const { worker, repository } = makeWorker(null);
    repository.claimNext
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(null);

    await expect(worker.tick(NOW)).rejects.toThrow('database unavailable');
    await expect(worker.tick(NOW)).resolves.toBe(false);
    expect(repository.claimNext).toHaveBeenCalledTimes(2);
  });

  it('does not overlap two local ticks', async () => {
    let release!: () => void;
    const blocked = new Promise<null>((resolve) => {
      release = () => resolve(null);
    });
    const { worker, repository } = makeWorker(null);
    repository.claimNext.mockReturnValueOnce(blocked);

    const first = worker.tick(NOW);
    await worker.tick(NOW);
    expect(repository.claimNext).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('backs empty queue polls off from one second to ten seconds', async () => {
    vi.useFakeTimers();
    const { worker, repository } = makeWorker(null);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claimNext).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.claimNext).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(repository.claimNext).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(repository.claimNext).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(repository.claimNext).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(repository.claimNext).toHaveBeenCalledTimes(6);

    worker.onModuleDestroy();
  });

  it('backs database errors off independently to thirty seconds', async () => {
    vi.useFakeTimers();
    const { worker, repository } = makeWorker(null);
    repository.claimNext.mockRejectedValue(new Error('database unavailable'));
    vi.spyOn((worker as unknown as { logger: { error: () => void } }).logger, 'error')
      .mockImplementation(() => undefined);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claimNext).toHaveBeenCalledTimes(1);
    for (const [delay, expectedCalls] of [
      [1_000, 2],
      [2_000, 3],
      [4_000, 4],
      [8_000, 5],
      [16_000, 6],
      [30_000, 7],
    ] as const) {
      await vi.advanceTimersByTimeAsync(delay);
      expect(repository.claimNext).toHaveBeenCalledTimes(expectedCalls);
    }

    worker.onModuleDestroy();
  });

  it('wakes immediately and resets the idle backoff', async () => {
    vi.useFakeTimers();
    const { worker, repository } = makeWorker(null);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(3_000);
    const callsBeforeWake = repository.claimNext.mock.calls.length;

    worker.wake();
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.claimNext).toHaveBeenCalledTimes(callsBeforeWake + 1);
    await vi.advanceTimersByTimeAsync(999);
    expect(repository.claimNext).toHaveBeenCalledTimes(callsBeforeWake + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(repository.claimNext).toHaveBeenCalledTimes(callsBeforeWake + 2);

    worker.onModuleDestroy();
  });

  it('observes cancellation on the dedicated lease heartbeat interval', async () => {
    vi.useFakeTimers();
    const { worker, repository, processor } = makeWorker();
    repository.extendLease.mockResolvedValueOnce('cancelled');
    let receivedSignal: AbortSignal | undefined;
    processor.execute.mockImplementationOnce(
      async (_job: AiDirectJobRecord, signal: AbortSignal) => {
        receivedSignal = signal;
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
        signal.throwIfAborted();
      },
    );

    const tick = worker.tick(NOW);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(repository.extendLease).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await tick;

    expect(repository.extendLease).toHaveBeenCalled();
    expect(receivedSignal?.aborted).toBe(true);
    expect(repository.checkpointResult).not.toHaveBeenCalled();
    expect(processor.project).not.toHaveBeenCalled();
  });
});
