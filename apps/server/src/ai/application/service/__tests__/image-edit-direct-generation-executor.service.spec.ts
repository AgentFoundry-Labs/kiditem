import { describe, expect, it, vi } from 'vitest';
import { ImageEditDirectGenerationExecutorService } from '../image-edit-direct-generation-executor.service';

describe('ImageEditDirectGenerationExecutorService', () => {
  it('validates provider bytes before saving to a stable job key', async () => {
    const imageEditMedia = {
      editImage: vi.fn().mockResolvedValue({
        buffer: Buffer.from('provider-output'),
        mimeType: 'image/png',
      }),
    };
    const imageStorage = {
      save: vi.fn().mockResolvedValue('https://cdn.example.com/edited.webp'),
      extractKey: vi.fn().mockReturnValue(null),
    };
    const generatedImageValidator = {
      validate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('validated-output'),
        mimeType: 'image/webp',
        extension: 'webp',
        width: 512,
        height: 512,
        fileSize: 16,
      }),
    };
    const service = new ImageEditDirectGenerationExecutorService(
      imageEditMedia as never,
      imageStorage as never,
      generatedImageValidator as never,
    );

    await expect(
      service.execute({
        organizationId: 'org-1',
        jobId: 'job-1',
        model: 'gemini-image-direct',
        input: {
          image_url: 'https://source.example.com/product.jpg',
          preset: 'custom',
          user_prompt: '밝게',
        },
      }),
    ).resolves.toEqual({ image_url: 'https://cdn.example.com/edited.webp' });

    expect(generatedImageValidator.validate).toHaveBeenCalledWith({
      buffer: Buffer.from('provider-output'),
      declaredMimeType: 'image/png',
    });
    expect(imageStorage.save).toHaveBeenCalledWith(
      'tmp/image-edits/org-1/job-1.webp',
      Buffer.from('validated-output'),
      'image/webp',
    );
  });

  it('does not persist a provider result after cancellation', async () => {
    const controller = new AbortController();
    const imageEditMedia = {
      editImage: vi.fn().mockImplementation(async () => {
        controller.abort('cancelled');
        return { buffer: Buffer.from('provider-output'), mimeType: 'image/png' };
      }),
    };
    const imageStorage = {
      save: vi.fn(),
      extractKey: vi.fn().mockReturnValue(null),
    };
    const generatedImageValidator = {
      validate: vi.fn().mockResolvedValue({
        buffer: Buffer.from('validated-output'),
        mimeType: 'image/webp',
        extension: 'webp',
        width: 512,
        height: 512,
        fileSize: 16,
      }),
    };
    const service = new ImageEditDirectGenerationExecutorService(
      imageEditMedia as never,
      imageStorage as never,
      generatedImageValidator as never,
    );

    await expect(service.execute({
      organizationId: 'org-1',
      jobId: 'job-1',
      model: 'gemini-image-direct',
      input: { image_url: 'https://source.example.com/product.jpg', preset: 'custom' },
      signal: controller.signal,
    })).rejects.toBe('cancelled');
    expect(imageStorage.save).not.toHaveBeenCalled();
  });
});
