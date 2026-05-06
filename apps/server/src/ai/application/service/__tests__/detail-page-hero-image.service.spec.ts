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

    expect(prompt).toContain('width=85mm, height=60mm');
    expect(prompt).toContain('85mm is the horizontal width and 60mm is the vertical height');
    expect(prompt).toContain('visibly wider than tall');
    expect(prompt).toContain('Do not stand the product upright');
  });
});
