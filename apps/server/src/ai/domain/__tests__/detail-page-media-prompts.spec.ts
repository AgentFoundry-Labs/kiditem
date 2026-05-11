import { describe, expect, it } from 'vitest';
import {
  buildDetailCutPrompt,
  buildSizeGuidePrompt,
  buildUsageGuidePrompt,
} from '../detail-page-media-prompts';

describe('detail-page media prompt builders', () => {
  it('instructs Gemini to keep a wide size-guide product horizontal', () => {
    const prompt = buildSizeGuidePrompt({
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
    const prompt = buildUsageGuidePrompt({
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
    const prompt = buildUsageGuidePrompt({
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
    const prompt = buildDetailCutPrompt({
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
