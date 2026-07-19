import { describe, expect, it, vi } from 'vitest';
import { DetailPageDirectGenerationExecutorService } from '../detail-page-direct-generation-executor.service';

describe('DetailPageDirectGenerationExecutorService', () => {
  it('stops before any provider call when the worker signal is already aborted', async () => {
    const textCompletion = { complete: vi.fn() };
    const generatedImages = { generateBestEffort: vi.fn() };
    const service = new DetailPageDirectGenerationExecutorService(
      textCompletion as never,
      {} as never,
      generatedImages as never,
    );
    const controller = new AbortController();
    controller.abort('cancelled');

    await expect(service.execute({
      organizationId: 'org-1',
      generationInput: {} as never,
      textModel: 'gemini-text-direct',
      modelPlan: { image: 'gemini-image-direct', vision: 'gemini-vision-direct' },
      signal: controller.signal,
    })).rejects.toBe('cancelled');
    expect(textCompletion.complete).not.toHaveBeenCalled();
    expect(generatedImages.generateBestEffort).not.toHaveBeenCalled();
  });
});
