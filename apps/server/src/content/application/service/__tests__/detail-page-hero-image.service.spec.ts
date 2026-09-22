import { describe, expect, it, vi } from 'vitest';
import type { DetailPageMediaPort } from '../../port/out/provider/detail-page-media.port';
import type { ImageFetchPort } from '../../port/out/provider/image-fetch.port';
import type { ImageStoragePort } from '../../port/out/storage/image-storage.port';
import { DetailPageHeroImageService } from '../detail-page-hero-image.service';

function makePortBackedService(input?: {
  media?: Partial<DetailPageMediaPort>;
  imageFetcher?: Partial<ImageFetchPort>;
  storage?: Partial<ImageStoragePort>;
}) {
  const media: DetailPageMediaPort = {
    generateImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('generated-image'),
      mimeType: 'image/png',
    }),
    completeVisionJson: vi.fn().mockResolvedValue('{"imageIndices":[0,0,2,99,"bad"]}'),
    ...input?.media,
  };
  const imageFetcher: ImageFetchPort = {
    fetchImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('source-image'),
      mimeType: 'image/jpeg',
      storageKey: null,
    }),
    fetchTrustedStorageImage: vi.fn().mockResolvedValue({
      buffer: Buffer.from('trusted-source-image'),
      mimeType: 'image/jpeg',
      storageKey: 'trusted/source.jpg',
    }),
    assertSupportedMime: vi.fn(),
    extForMime: vi.fn().mockReturnValue('png'),
    ...input?.imageFetcher,
  };
  const storage: ImageStoragePort = {
    save: vi.fn().mockResolvedValue('https://cdn.example.com/generated.png'),
    extractKey: vi.fn().mockReturnValue(null),
    ...input?.storage,
  };
  const generatedImageValidator = {
    validate: vi.fn().mockResolvedValue({
      buffer: Buffer.from('validated-image'),
      mimeType: 'image/webp',
      extension: 'webp',
      width: 1200,
      height: 675,
      fileSize: 15,
    }),
  };

  return {
    service: new DetailPageHeroImageService(
      media,
      storage,
      imageFetcher,
      generatedImageValidator,
    ),
    media,
    imageFetcher,
    storage,
    generatedImageValidator,
  };
}

describe('DetailPageHeroImageService', () => {
  it('generates hero images through the detail-page media port and stores the returned buffer', async () => {
    const {
      service,
      media,
      imageFetcher,
      storage,
      generatedImageValidator,
    } = makePortBackedService();

    const url = await service.generateHeroBanner({
      model: 'gemini-image-model',
      organizationId: 'org-1',
      productName: '말랑이 세트',
      category: '완구',
      description: '손으로 누르는 촉감 놀이',
      options: '',
      templateId: 'bold-vertical',
      headline: '말랑이 세트',
      subhead: '매일 만지는 촉감 놀이',
      imageUrls: ['https://example.com/source.jpg'],
    });

    expect(url).toBe('https://cdn.example.com/generated.png');
    expect(imageFetcher.fetchImage).toHaveBeenCalledWith(
      'https://example.com/source.jpg',
      { signal: undefined },
    );
    expect(media.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: '16:9',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_hero_image_returned_no_image',
      images: [
        expect.objectContaining({
          data: Buffer.from('source-image').toString('base64'),
          mimeType: 'image/jpeg',
          label: '상품 이미지 1',
        }),
      ],
    }));
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^detail-page-hero-banners\/org-1\/.+\.webp$/),
      Buffer.from('validated-image'),
      'image/webp',
    );
    expect(generatedImageValidator.validate).toHaveBeenCalledWith({
      buffer: Buffer.from('generated-image'),
      declaredMimeType: 'image/png',
    });
  });

  it('filters color image selections returned by the detail-page media port', async () => {
    const { service } = makePortBackedService();

    await expect(service.inferColorImageSelection({
      model: 'gemini-vision-model',
      productName: '말랑이 세트',
      category: '완구',
      description: '',
      options: '',
      imageUrls: [
        'https://example.com/a.jpg',
        'https://example.com/b.jpg',
        'https://example.com/c.jpg',
      ],
    })).resolves.toEqual([0, 2]);
  });

  it('generates a separate studio hero product image for bold vertical body sections', async () => {
    const { service, media, storage } = makePortBackedService();

    await expect(service.generateHeroProductImage({
      model: 'gemini-image-model',
      organizationId: 'org-1',
      productName: '퐁퐁 버블팝',
      category: '완구',
      description: '랜덤 색상 비눗방울',
      options: '색상 구성: 여러 색상',
      imageUrls: ['https://example.com/source.jpg'],
    })).resolves.toBe('https://cdn.example.com/generated.png');

    expect(media.generateImage).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: '4:3',
      imageSize: '2K',
      noImageErrorCode: 'detail_page_hero_product_image_returned_no_image',
      prompt: expect.stringContaining('do NOT output one giant single unit'),
    }));
    expect(storage.save).toHaveBeenCalledWith(
      expect.stringMatching(/^detail-page-hero-products\/org-1\/.+\.webp$/),
      Buffer.from('validated-image'),
      'image/webp',
    );
  });
});
