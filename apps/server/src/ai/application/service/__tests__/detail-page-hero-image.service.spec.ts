import { describe, expect, it } from 'vitest';
import { DetailPageHeroImageService } from '../detail-page-hero-image.service';

function makeService() {
  return new DetailPageHeroImageService(
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
    }): string;
    buildDetailCutPrompt(input: {
      organizationId: string;
      productName: string;
      category: string;
      description: string;
      options: string;
      imageUrls: string[];
      variant?: number;
    }): string;
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
});
