import { describe, expect, it } from 'vitest';
import { buildProductGenerationPayload } from './product-generation-payload';

describe('buildProductGenerationPayload', () => {
  it('maps product generation form state to /api/sourcing/product-generation body', () => {
    const payload = buildProductGenerationPayload({
      title: ' 자석 다트게임 ',
      category: ' 완구 ',
      keyword: ' 자석 다트 ',
      target: '초등학생',
      description: '안전한 다트 보드',
      thumbnailUrls: [
        'https://example.com/thumb.jpg',
        'https://example.com/thumb-2.jpg',
        'https://example.com/thumb.jpg',
        '  ',
      ],
      imageUrls: ['https://example.com/a.jpg', 'https://example.com/a.jpg', '  '],
      rawOptions: '노란색\n노란색, 파란색',
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: '',
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      colorVariantNames: '',
      boxSetStatus: 'auto',
      boxSetQuantity: '',
    });

    expect(payload).toEqual({
      title: '자석 다트게임',
      category: '완구',
      target: '초등학생',
      description: '안전한 다트 보드',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      thumbnailUrls: ['https://example.com/thumb.jpg', 'https://example.com/thumb-2.jpg'],
      imageUrls: ['https://example.com/a.jpg'],
      optionNames: ['노란색', '파란색'],
      keywords: ['자석 다트'],
      templateId: 'bold-vertical',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      productSize: '높이: 30cm',
      colorVariantStatus: 'auto',
      boxSetStatus: 'auto',
    });
  });
});
