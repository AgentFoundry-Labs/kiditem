import { describe, expect, it, vi } from 'vitest';
import type { AiDirectJobRecord } from '../../port/out/repository/ai-direct-job.repository.port';
import { AiDirectJobProcessorService } from '../ai-direct-job-processor.service';

function imageJob(): AiDirectJobRecord {
  const now = new Date();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'image_edit',
    sourceResourceId: '11111111-1111-4111-8111-111111111111',
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
    scheduledFor: now,
    claimedAt: now,
    claimedBy: 'worker',
    leaseExpiresAt: now,
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProcessor() {
  const hydrator = { hydrateThumbnail: vi.fn() };
  const thumbnailExecutor = { execute: vi.fn() };
  const detailPageExecutor = { execute: vi.fn() };
  const imageEditExecutor = {
    execute: vi.fn().mockResolvedValue({
      image_url: 'https://storage.example.com/output.png',
    }),
  };
  const thumbnailGenerationJobs = { processEditJob: vi.fn() };
  const thumbnailSink = { applySuccess: vi.fn(), applyFailure: vi.fn() };
  const detailPageSink = { applySuccess: vi.fn(), applyFailure: vi.fn() };
  const thumbnailLedger = {
    findGenerationProjectionStatus: vi.fn(),
    readParentAlertLink: vi.fn().mockResolvedValue(null),
  };
  const detailPageRepository = { findCancellableGeneration: vi.fn() };
  const operationAlerts = {
    findByOperationKey: vi.fn().mockResolvedValue({ status: 'running' }),
    succeed: vi.fn(),
    fail: vi.fn(),
  };
  const productGenerationAlerts = { canStartChild: vi.fn().mockResolvedValue(true) };
  return {
    processor: new AiDirectJobProcessorService(
      hydrator as never,
      thumbnailExecutor as never,
      detailPageExecutor as never,
      imageEditExecutor as never,
      thumbnailGenerationJobs as never,
      thumbnailSink as never,
      detailPageSink as never,
      thumbnailLedger as never,
      detailPageRepository as never,
      operationAlerts as never,
      productGenerationAlerts as never,
    ),
    imageEditExecutor,
    operationAlerts,
  };
}

describe('AiDirectJobProcessorService', () => {
  it('preflights image-edit work against its operation alert', async () => {
    const { processor, operationAlerts } = makeProcessor();

    await expect(processor.preflight(imageJob())).resolves.toBe('runnable');
    expect(operationAlerts.findByOperationKey).toHaveBeenCalledWith(
      imageJob().organizationId,
      `image-edit:${imageJob().id}`,
    );
  });

  it('routes image-edit execution with the captured model plan', async () => {
    const { processor, imageEditExecutor } = makeProcessor();

    await processor.execute(imageJob(), new AbortController().signal);

    expect(imageEditExecutor.execute).toHaveBeenCalledWith({
      organizationId: imageJob().organizationId,
      model: 'image-model',
      input: imageJob().payload.input,
      jobId: imageJob().id,
      signal: expect.any(AbortSignal),
    });
  });

  it('validates and projects a checkpointed image-edit result', async () => {
    const { processor, operationAlerts } = makeProcessor();

    await processor.project(imageJob(), {
      image_url: 'https://storage.example.com/output.png',
    });

    expect(operationAlerts.succeed).toHaveBeenCalledWith(
      imageJob().organizationId,
      `image-edit:${imageJob().id}`,
      expect.objectContaining({
        metadata: expect.objectContaining({
          imageUrl: 'https://storage.example.com/output.png',
        }),
      }),
    );
  });
});
