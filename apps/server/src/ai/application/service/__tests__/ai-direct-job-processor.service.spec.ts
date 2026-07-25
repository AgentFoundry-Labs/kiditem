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

function rasterJob(): AiDirectJobRecord {
  const now = new Date();
  return {
    id: '33333333-3333-4333-8333-333333333333',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'detail_page_rasterize',
    sourceResourceId: '44444444-4444-5444-8444-444444444444',
    status: 'running',
    payload: {
      jobType: 'detail_page_rasterize',
      models: {},
      input: {
        revisionId: '60620087-f5d8-4307-8591-221fd018eaa0',
        artifactId: '71429ba3-af81-409e-a976-029c67d86bcb',
        outputWidth: 780,
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
  const rasterExecutor = {
    preflight: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue({
      revisionId: rasterJob().payload.input.revisionId,
      artifactId: rasterJob().payload.input.artifactId,
      imageUrl: 'https://storage.example.com/detail.jpg',
      outputWidth: 780,
      contentType: 'image/jpeg',
      byteLength: 1024,
    }),
  };
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
      rasterExecutor as never,
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
    rasterExecutor,
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

  it('preflights and executes detail-page raster work through the dedicated executor', async () => {
    const { processor, rasterExecutor } = makeProcessor();
    const signal = new AbortController().signal;

    await expect(processor.preflight(rasterJob())).resolves.toBe('runnable');
    await processor.execute(rasterJob(), signal);

    expect(rasterExecutor.preflight).toHaveBeenCalledWith({
      organizationId: rasterJob().organizationId,
      input: rasterJob().payload.input,
    });
    expect(rasterExecutor.execute).toHaveBeenCalledWith({
      organizationId: rasterJob().organizationId,
      input: rasterJob().payload.input,
      signal,
    });
  });

  it('validates the raster checkpoint during projection', async () => {
    const { processor } = makeProcessor();

    await expect(processor.project(rasterJob(), {
      revisionId: rasterJob().payload.input.revisionId,
      artifactId: rasterJob().payload.input.artifactId,
      imageUrl: 'not-a-url',
      outputWidth: 780,
      contentType: 'image/jpeg',
      byteLength: 1024,
    })).rejects.toThrow();
  });
});
