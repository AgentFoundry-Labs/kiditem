import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KiditemExternalError } from '@kiditem/shared/errors';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID as ORG,
} from '../../../../test-helpers/real-prisma';
import { aiDirectJobOperations, AI_DIRECT_JOB_TEST_CONFIG } from '../../../__tests__/helpers/ai-direct-job-operations';
import { AiDirectJobWorkerService } from '../ai-direct-job-worker.service';
import type { AiDirectJobEnvelope } from '../../../domain/direct-job/ai-direct-job.schema';
import type { AiDirectJob } from '../../../domain/direct-job/ai-direct-job-operation';

const OUTPUT = { image_url: 'https://storage.example.com/output.png' };
const imageEdit: AiDirectJobEnvelope = {
  jobType: 'image_edit',
  models: { image: 'image-model' },
  input: { image_url: 'https://storage.example.com/input.png', preset: 'custom' },
};
const thumbnail: AiDirectJobEnvelope = {
  jobType: 'thumbnail_generate',
  models: { image: 'image-model' },
  input: {
    mode: 'creative',
    inputs: [{
      mimeType: 'image/png', label: 'Product', url: 'https://storage.example.com/input.png',
      storageKey: 'thumbnail-inputs/input.png', role: 'product', sortOrder: 0, source: 'upload', fileSize: 3,
    }],
  },
};

/**
 * AI 생성 워커를 실제 실행 계약 위에서 돌린다(KID-358). 바꾼 것은 processor뿐이다: 모델 호출(AI 게이트웨이)과
 * 결과 반영 sink 자리를 기록용으로 둔다. claim · 결과 청크 · 재시도 · 최종 실패 · 취소는 진짜 PG 행이 결정한다.
 */
describe('AI direct job worker on the operation contract (PG integration)', () => {
  let prisma: PrismaClient;
  let processor: {
    preflight: ReturnType<typeof vi.fn>;
    execute: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof vi.fn>;
    projectFailure: ReturnType<typeof vi.fn>;
  };
  let jobs: ReturnType<typeof aiDirectJobOperations>['jobs'];
  let config = AI_DIRECT_JOB_TEST_CONFIG;
  let worker: AiDirectJobWorkerService;

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();
  });

  afterAll(async () => prisma?.$disconnect());

  function boot(overrides: Partial<typeof AI_DIRECT_JOB_TEST_CONFIG> = {}) {
    config = { ...AI_DIRECT_JOB_TEST_CONFIG, ...overrides };
    processor = {
      preflight: vi.fn().mockResolvedValue('runnable'),
      execute: vi.fn().mockResolvedValue(OUTPUT),
      project: vi.fn().mockResolvedValue(undefined),
      projectFailure: vi.fn().mockResolvedValue(undefined),
    };
    ({ jobs } = aiDirectJobOperations(prisma, processor as never, config));
    worker = new AiDirectJobWorkerService(jobs, processor as never, config);
  }

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    boot();
  });

  const prepare = async (payload: AiDirectJobEnvelope = imageEdit) =>
    (await jobs.prepare(undefined, { organizationId: ORG, jobType: payload.jobType, sourceResourceId: randomUUID(), payload })).jobId;
  const row = (id: string) => prisma.operation.findUniqueOrThrow({ where: { id } });
  const expireLease = (id: string) => prisma.operation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1_000) } });
  const dueNow = (id: string) => prisma.operation.update({ where: { id }, data: { scheduledFor: new Date(Date.now() - 1_000) } });

  it('executes, saves the result, and finishes: finalize projects it once and the operation carries it', async () => {
    const id = await prepare();
    await expect(worker.tick()).resolves.toBe(true);

    expect(processor.execute).toHaveBeenCalledTimes(1);
    expect(processor.project).toHaveBeenCalledTimes(1);
    expect(processor.project).toHaveBeenCalledWith(expect.objectContaining({ id, organizationId: ORG, jobType: 'image_edit' }), OUTPUT, expect.anything());
    await expect(row(id)).resolves.toMatchObject({ status: 'succeeded', attempts: 1, result: OUTPUT, progress: { checkpoint: 'result_saved' } });
    await expect(prisma.operationChunk.count()).resolves.toBe(0);
    await expect(worker.tick()).resolves.toBe(false);
  });

  it('two workers polling at once take the job exactly once', async () => {
    await prepare();
    const other = new AiDirectJobWorkerService(jobs, processor as never, config);
    const ticks = await Promise.all([worker.tick(), other.tick()]);
    expect(ticks.sort()).toEqual([false, true]);
    expect(processor.execute).toHaveBeenCalledTimes(1);
  });

  it('reuses a saved result after the first worker died, without calling the provider again', async () => {
    const id = await prepare(thumbnail);
    const saved = { candidates: [{ url: 'http://kiditem-office:9000/kiditem/thumbnail-generations/output.png', storageKey: 'thumbnail-generations/output.png' }] };
    const first = (await jobs.claim('dead-worker'))!;
    await expect(jobs.saveResult(first.job, first.token, saved)).resolves.toBe(true);
    await expireLease(id);

    await worker.tick();

    expect(processor.execute).not.toHaveBeenCalled();
    expect(processor.project).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'thumbnail_generate' }), saved, expect.anything());
    await expect(row(id)).resolves.toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('a projection that fails after the result was saved keeps it: the next claim finishes from the saved chunk without the model', async () => {
    const id = await prepare();
    const error = vi.spyOn((worker as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    processor.project.mockRejectedValueOnce(new Error('database connection reset'));

    await worker.tick();

    expect(processor.execute).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('database connection reset'));
    await expect(row(id)).resolves.toMatchObject({
      status: 'executing',
      attempts: 1,
      progress: { checkpoint: 'result_saved', finishError: { code: 'direct_ai_execution_failed', message: 'database connection reset' } },
    });
    await expect(prisma.operationChunk.count({ where: { operationId: id, chunkKind: 'result' } })).resolves.toBe(1);
    expect(processor.projectFailure).not.toHaveBeenCalled();

    await expireLease(id);
    await worker.tick();

    expect(processor.execute).toHaveBeenCalledTimes(1);
    expect(processor.project).toHaveBeenCalledTimes(2);
    expect(processor.project).toHaveBeenLastCalledWith(expect.objectContaining({ id }), OUTPUT, expect.anything());
    await expect(row(id)).resolves.toMatchObject({ status: 'succeeded', attempts: 2, result: OUTPUT });
  });

  it('requeues a retryable provider failure with the first backoff and keeps the generation open', async () => {
    const id = await prepare();
    processor.execute.mockRejectedValueOnce(new Error('provider unavailable'));
    const before = Date.now();

    await worker.tick();

    const requeued = await row(id);
    expect(requeued).toMatchObject({ status: 'prepared', attempts: 1, errorCode: 'direct_ai_execution_failed', errorMessage: 'provider unavailable' });
    expect(requeued.scheduledFor!.getTime() - before).toBeGreaterThanOrEqual(5_000);
    expect(requeued.scheduledFor!.getTime() - before).toBeLessThan(6_000);
    expect(processor.projectFailure).not.toHaveBeenCalled();
    await expect(prisma.operationLock.count({ where: { operationId: id } })).resolves.toBe(1);
    await expect(worker.tick()).resolves.toBe(false);
  });

  it('records the final failure once when the third attempt fails too', async () => {
    const id = await prepare();
    processor.execute.mockRejectedValue(new Error('provider unavailable'));
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await worker.tick();
      if (attempt < 3) await dueNow(id);
    }
    await expect(row(id)).resolves.toMatchObject({ status: 'failed', attempts: 3, errorCode: 'direct_ai_execution_failed' });
    expect(processor.execute).toHaveBeenCalledTimes(3);
    expect(processor.projectFailure).toHaveBeenCalledTimes(1);
    expect(processor.projectFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id }),
      { errorCode: 'direct_ai_execution_failed', errorMessage: 'provider unavailable', retryable: false },
      expect.anything(),
    );
    await expect(prisma.operationLock.count()).resolves.toBe(0);
  });

  it('keeps the stored message and logs the KiditemError details it cannot store', async () => {
    const id = await prepare();
    const warn = vi.spyOn((worker as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => undefined);
    processor.execute.mockRejectedValueOnce(new KiditemExternalError('CONTENT_GENERATION_FAILED', {
      details: { reason: 'detail_page_color_subtitle_empty' },
    }));

    await worker.tick();

    await expect(row(id)).resolves.toMatchObject({
      errorCode: 'CONTENT_GENERATION_FAILED',
      errorMessage: 'AI 생성에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('detail_page_color_subtitle_empty'));
  });

  it('fails invalid provider output without saving it or retrying, and records the failure', async () => {
    const id = await prepare();
    processor.execute.mockResolvedValueOnce({});

    await worker.tick();

    await expect(row(id)).resolves.toMatchObject({ status: 'failed', errorCode: 'direct_ai_output_invalid', attempts: 1, progress: null });
    expect(processor.project).not.toHaveBeenCalled();
    expect(processor.projectFailure).toHaveBeenCalledTimes(1);
  });

  it('fails an invalid saved result without rerunning the provider', async () => {
    const id = await prepare();
    const first = (await jobs.claim('dead-worker'))!;
    // 결과 청크는 검증된 값만 받지만, 옛 워커가 남긴 값이 틀렸다고 해도 반영 전에 다시 판정한다.
    await jobs.saveResult(first.job, first.token, {});
    await expireLease(id);

    await worker.tick();

    expect(processor.execute).not.toHaveBeenCalled();
    await expect(row(id)).resolves.toMatchObject({ status: 'failed', errorCode: 'direct_ai_output_invalid' });
    expect(processor.projectFailure).toHaveBeenCalledTimes(1);
  });

  it('fails a missing model without another attempt', async () => {
    const id = await prepare();
    processor.execute.mockRejectedValueOnce(Object.assign(new Error('model missing'), { code: 'model_required' }));

    await worker.tick();

    await expect(row(id)).resolves.toMatchObject({ status: 'failed', errorCode: 'model_required', attempts: 1 });
    expect(processor.projectFailure).toHaveBeenCalledTimes(1);
  });

  it('preflights before the provider: a finished source cancels the job, a missing source fails it', async () => {
    const cancelled = await prepare();
    processor.preflight.mockResolvedValueOnce('cancelled');
    await worker.tick();
    await expect(row(cancelled)).resolves.toMatchObject({ status: 'cancelled', errorCode: 'USER_CANCELLED' });

    const invalid = await prepare();
    processor.preflight.mockResolvedValueOnce('invalid');
    await worker.tick();
    await expect(row(invalid)).resolves.toMatchObject({ status: 'failed', errorCode: 'direct_ai_source_invalid' });

    expect(processor.execute).not.toHaveBeenCalled();
    expect(processor.projectFailure).toHaveBeenCalledTimes(1);
    expect(processor.projectFailure).toHaveBeenCalledWith(expect.objectContaining({ id: invalid }), expect.anything(), expect.anything());
  });

  it('stops a running job when the heartbeat sees it was cancelled, and writes nothing after', async () => {
    boot({ leaseHeartbeatMs: 20 });
    const id = await prepare();
    let started!: () => void;
    const running = new Promise<void>((resolve) => { started = resolve; });
    processor.execute.mockImplementationOnce(async (_job: AiDirectJob, signal: AbortSignal) => {
      started();
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
      signal.throwIfAborted();
    });

    const tick = worker.tick();
    await running;
    await jobs.cancel(ORG, id);
    await tick;

    await expect(row(id)).resolves.toMatchObject({ status: 'cancelled', progress: null });
    expect(processor.project).not.toHaveBeenCalled();
    expect(processor.projectFailure).not.toHaveBeenCalled();
  });
});
