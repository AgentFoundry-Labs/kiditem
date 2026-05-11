import { describe, expect, it, vi } from 'vitest';
import type { DetailPageMediaPort } from '../../port/out/detail-page-media.port';
import type { ImageFetchPort } from '../../port/out/image-fetch.port';
import type { ImageStoragePort } from '../../port/out/image-storage.port';
import { DetailPageHeroImageService } from '../detail-page-hero-image.service';

function makeService() {
  return new DetailPageHeroImageService(
    {} as never,
    {} as never,
    {} as never,
  ) as unknown as {
    buildSizeGuidePrompt(input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      imageUrls: string[];
      heightLabel?: string;
      widthLabel?: string;
      ageGroup?: 'age-8-plus' | 'age-14-plus';
    }): string;
    buildUsageGuidePrompt(input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      imageUrls: string[];
      usageStep?: string;
      variant?: number;
      ageGroup?: 'age-8-plus' | 'age-14-plus';
    }): string;
    buildDetailCutPrompt(input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      imageUrls: string[];
      variant?: number;
      ageGroup?: 'age-8-plus' | 'age-14-plus';
    }): string;
  };
}

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

  return {
    service: new DetailPageHeroImageService(media, storage, imageFetcher),
    media,
    imageFetcher,
    storage,
  };
}

describe('DetailPageHeroImageService', () => {
  it('instructs Gemini to keep a wide size-guide product horizontal', () => {
    const service = makeService();

    const prompt = service.buildSizeGuidePrompt({
      organizationId: 'org',
      productName: '고양이 꾹꾹 베개말랑이',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      heightLabel: '60mm',
      widthLabel: '85mm',
    });

    expect(prompt).toContain('85mm is the horizontal width and 60mm is the vertical height');
    expect(prompt).toContain('visibly wider than tall');
    expect(prompt).toContain('Do not stand the product upright');
    expect(prompt).not.toContain('Template measurement labels');
    expect(prompt).toContain('Absolutely do not add measurement lines, arrows, rulers, dimension text, or numbers');
  });

  it('keeps generated usage images photo-only and leaves step text to the template', () => {
    const service = makeService();

    const prompt = service.buildUsageGuidePrompt({
      organizationId: 'org',
      productName: '바삭바삭 수제왁스팝',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      usageStep: '포장을 열고 왁스팝을 준비하세요.',
      variant: 1,
    });

    expect(prompt).toContain('IMAGE-ONLY OUTPUT');
    expect(prompt).toContain('Do not create an instruction card');
    expect(prompt).toContain('Do not render "사용법 안내"');
    expect(prompt).toContain('natural short nails, no manicure, no nail polish');
  });

  it('uses teen/student audience rules for 14+ generated images', () => {
    const service = makeService();

    const prompt = service.buildUsageGuidePrompt({
      organizationId: 'org',
      productName: '학생용 말랑이',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      usageStep: '친구와 함께 촉감을 확인하세요.',
      variant: 1,
      ageGroup: 'age-14-plus',
    });

    expect(prompt).toContain('middle/high-school aged teenager or student');
    expect(prompt).toContain('Do NOT depict a preschool child');
    expect(prompt).toContain('Target age/audience: 14+ product');
  });

  it('prevents detail generated images from becoming callout cards', () => {
    const service = makeService();

    const prompt = service.buildDetailCutPrompt({
      organizationId: 'org',
      productName: '바삭바삭 수제왁스팝',
      category: '완구',
      description: '',
      options: '',
      imageUrls: ['https://example.com/product.jpg'],
      variant: 1,
    });

    expect(prompt).toContain('not a callout card');
    expect(prompt).toContain('Do not create a "DETAIL FEATURE CALLOUT" design');
    expect(prompt).toContain('Do not render the product name inside this image');
    expect(prompt).toContain('No Korean text, English text, numbers');
  });

  it('generates hero images through the detail-page media port and stores the returned buffer', async () => {
    const { service, media, imageFetcher, storage } = makePortBackedService();

    const url = await service.generateHeroBanner({
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
    expect(imageFetcher.fetchImage).toHaveBeenCalledWith('https://example.com/source.jpg');
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
      expect.stringMatching(/^detail-page-hero-banners\/org-1\/.+\.png$/),
      Buffer.from('generated-image'),
      'image/png',
    );
  });

  it('filters color image selections returned by the detail-page media port', async () => {
    const { service } = makePortBackedService();

    await expect(service.inferColorImageSelection({
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
});
