import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ImageAssetOperationService } from '../image-asset-operation.service';
import type { ImageFetchPort } from '../../port/out/provider/image-fetch.port';
import type { ImageStoragePort } from '../../port/out/storage/image-storage.port';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');

function makeFetcher(overrides: Partial<ImageFetchPort> = {}): ImageFetchPort {
  return {
    fetchImage: vi.fn(),
    fetchTrustedStorageImage: vi.fn(),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn((mimeType: string) => (mimeType.includes('jpeg') ? 'jpg' : 'png')),
    ...overrides,
  } as ImageFetchPort;
}

function makeStorage(overrides: Partial<ImageStoragePort> = {}): ImageStoragePort {
  return {
    save: vi.fn(async (key: string) => `https://cdn.example.com/${key}`),
    copy: vi.fn(),
    delete: vi.fn(),
    extractKey: vi.fn(() => null),
    ...overrides,
  } as ImageStoragePort;
}

describe('ImageAssetOperationService', () => {
  it('crops an own-storage image on the server and writes a temporary storage URL', async () => {
    const sourceBuffer = await sharp({
      create: {
        width: 100,
        height: 80,
        channels: 4,
        background: '#ff0000',
      },
    })
      .png()
      .toBuffer();
    const imageUrl = 'http://localhost:9000/kiditem/tmp/source.png';
    const fetcher = makeFetcher({
      fetchTrustedStorageImage: vi.fn(async () => ({
        buffer: sourceBuffer,
        mimeType: 'image/png',
        storageKey: 'tmp/source.png',
      })),
    });
    const storage = makeStorage({
      extractKey: vi.fn((url: string) => (url === imageUrl ? 'tmp/source.png' : null)),
    });
    const service = new ImageAssetOperationService(fetcher, storage);

    const result = await service.cropImage({
      organizationId: 'org-1',
      imageUrl,
      crop: { x: 10, y: 25, width: 50, height: 50 },
    });

    expect(fetcher.fetchTrustedStorageImage).toHaveBeenCalledWith(imageUrl);
    expect(fetcher.fetchImage).not.toHaveBeenCalled();
    expect(result.imageUrl).toMatch(/^https:\/\/cdn\.example\.com\/tmp\/image-crops\/org-1\/crop-/);
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^tmp\/image-crops\/org-1\/crop-[\w-]+\.png$/),
      expect.any(Buffer),
      'image/png',
    );
    const savedBuffer = vi.mocked(storage.save).mock.calls[0][1] as Buffer;
    await expect(sharp(savedBuffer).metadata()).resolves.toMatchObject({
      width: 50,
      height: 40,
      format: 'png',
    });
  });

  it('propagates public URL guard failures from the shared image fetch seam', async () => {
    const fetcher = makeFetcher({
      fetchImage: vi.fn(async () => {
        throw new BadRequestException('image url host not allowed');
      }),
    });
    const storage = makeStorage();
    const service = new ImageAssetOperationService(fetcher, storage);

    await expect(service.cropImage({
      organizationId: 'org-1',
      imageUrl: 'http://127.0.0.1/private.png',
      crop: { x: 0, y: 0, width: 50, height: 50 },
    })).rejects.toThrow('image url host not allowed');

    expect(fetcher.fetchImage).toHaveBeenCalledWith('http://127.0.0.1/private.png');
    expect(storage.save).not.toHaveBeenCalled();
  });
});
