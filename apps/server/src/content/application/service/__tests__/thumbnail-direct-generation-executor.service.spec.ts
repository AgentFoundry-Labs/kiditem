import { describe, expect, it, vi } from 'vitest';
import { ThumbnailDirectGenerationExecutorService } from '../thumbnail-direct-generation-executor.service';

describe('ThumbnailDirectGenerationExecutorService', () => {
  it('passes the worker signal and captured model to thumbnail generation', async () => {
    const editorAi = {
      generateEdit: vi.fn().mockResolvedValue([
        { url: 'https://cdn.example.com/output.png', storageKey: 'output.png' },
      ]),
      generateCreative: vi.fn(),
    };
    const service = new ThumbnailDirectGenerationExecutorService(editorAi as never);
    const signal = new AbortController().signal;

    await service.execute({
      organizationId: 'org-1',
      model: 'gemini-image-direct',
      signal,
      generationInput: {
        mode: 'edit',
        inputs: [{
          data: 'aW1n',
          mimeType: 'image/png',
          label: 'Product',
          url: 'https://cdn.example.com/input.png',
          storageKey: 'input.png',
          role: 'product',
          sortOrder: 0,
          source: 'upload',
          fileSize: 3,
        }],
      },
    });

    expect(editorAi.generateEdit).toHaveBeenCalledWith(
      expect.any(Array),
      'org-1',
      expect.objectContaining({ model: 'gemini-image-direct', signal }),
    );
  });
});
