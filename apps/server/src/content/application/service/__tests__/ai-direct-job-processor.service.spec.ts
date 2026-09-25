import { describe, expect, it, vi } from 'vitest';
import type { AiDirectJob } from '../../../domain/direct-job/ai-direct-job-operation';
import { AiDirectJobProcessorService } from '../ai-direct-job-processor.service';

function imageJob(): AiDirectJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    jobType: 'image_edit',
    sourceResourceId: '11111111-1111-4111-8111-111111111111',
    payload: {
      jobType: 'image_edit',
      models: { image: 'image-model' },
      input: {
        image_url: 'https://storage.example.com/input.png',
        preset: 'custom',
      },
    },
    attempts: 1,
    maxAttempts: 3,
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
  };
  const detailPageRepository = { findCancellableGeneration: vi.fn() };
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
    ),
    imageEditExecutor,
    thumbnailSink,
    detailPageSink,
  };
}

describe('AiDirectJobProcessorService', () => {
  it('preflights image-edit work from the durable direct job owner', async () => {
    const { processor } = makeProcessor();

    await expect(processor.preflight(imageJob())).resolves.toBe('runnable');
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

  it('validates and projects a checkpointed image-edit result without a second status owner', async () => {
    const { processor, thumbnailSink, detailPageSink } = makeProcessor();

    await processor.project(imageJob(), {
      image_url: 'https://storage.example.com/output.png',
    });

    expect(thumbnailSink.applySuccess).not.toHaveBeenCalled();
    expect(detailPageSink.applySuccess).not.toHaveBeenCalled();
  });

});
