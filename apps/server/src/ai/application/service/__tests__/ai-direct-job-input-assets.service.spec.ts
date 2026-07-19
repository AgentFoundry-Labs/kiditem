import { describe, expect, it, vi } from 'vitest';
import { AiDirectJobInputAssetsService } from '../ai-direct-job-input-assets.service';

function makeService() {
  const imageFetcher = {
    fetchImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('remote-image'),
      mimeType: 'image/jpeg',
      storageKey: null,
    }),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn((mimeType: string) =>
      mimeType === 'image/png' ? 'png' : 'jpg',
    ),
  };
  const imageStorage = {
    extractKey: vi.fn((url: string) =>
      url.startsWith('https://storage.example.com/') ? 'managed/input.png' : null,
    ),
    save: vi.fn(async (key: string) => `https://storage.example.com/${key}`),
  };
  return {
    service: new AiDirectJobInputAssetsService(
      imageFetcher as never,
      imageStorage as never,
    ),
    imageFetcher,
    imageStorage,
  };
}

describe('AiDirectJobInputAssetsService', () => {
  it('keeps existing managed image-edit URLs without copying them', async () => {
    const { service, imageFetcher, imageStorage } = makeService();

    await expect(
      service.persistImageEditInputs({
        organizationId: 'org-1',
        jobId: 'job-1',
        payload: {
          image_url: 'https://storage.example.com/input.png',
          preset: 'custom',
        },
      }),
    ).resolves.toMatchObject({
      image_url: 'https://storage.example.com/input.png',
    });
    expect(imageFetcher.fetchImage).not.toHaveBeenCalled();
    expect(imageStorage.save).not.toHaveBeenCalled();
  });

  it('materializes data and public URLs under the durable job input prefix', async () => {
    const { service, imageStorage } = makeService();

    const result = await service.persistImageEditInputs({
      organizationId: 'org-1',
      jobId: 'job-1',
      payload: {
        image_urls: [
          `data:image/png;base64,${Buffer.from('inline-image').toString('base64')}`,
          'https://public.example.com/remote.jpg',
        ],
        preset: 'color_guide',
      },
    });

    expect(imageStorage.save).toHaveBeenNthCalledWith(
      1,
      'ai-job-inputs/org-1/job-1/0.png',
      Buffer.from('inline-image'),
      'image/png',
    );
    expect(imageStorage.save).toHaveBeenNthCalledWith(
      2,
      'ai-job-inputs/org-1/job-1/1.jpg',
      Buffer.from('remote-image'),
      'image/jpeg',
    );
    expect(result.image_urls).toEqual([
      'https://storage.example.com/ai-job-inputs/org-1/job-1/0.png',
      'https://storage.example.com/ai-job-inputs/org-1/job-1/1.jpg',
    ]);
  });
});
