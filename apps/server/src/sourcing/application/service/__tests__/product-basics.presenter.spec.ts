import { describe, expect, it } from 'vitest';
import { buildProductBasics } from '../product-basics.presenter';

describe('buildProductBasics', () => {
  it('uses ProductPreparation registrationInput as the primary basic information source', () => {
    const result = buildProductBasics({
      candidate: {
        id: 'candidate-1',
        name: '수집 상품명',
        description: '수집 설명',
        category: '수집 카테고리',
        tags: ['수집태그'],
        rawData: { title: '원본명', optionNames: ['빨강', '파랑'] },
        thumbnailUrl: 'https://cdn.example.com/source.jpg',
        imageUrl: 'https://cdn.example.com/source.jpg',
        images: [
          { url: 'https://cdn.example.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
        ],
      },
      preparation: {
        registrationInput: {
          name: '상품 생성 입력명',
          category: '완구 > 보드게임',
          description: '상품 생성 설명',
          target: '초등학생',
          ageGroup: 'age-8-plus',
          tags: ['자석', '다트'],
          keywords: ['안전 다트'],
          optionNames: ['단품'],
          kcCertificationStatus: 'exists',
          kcCertificationNumber: 'CB061R1234-1001',
          productSize: '높이: 30cm',
          colorVariantStatus: 'multiple',
          colorVariantNames: '빨강, 파랑',
          boxSetStatus: 'box',
          boxSetQuantity: '1박스',
          salePrice: 12900,
          originalPrice: 15900,
          discountRate: 19,
        },
        selectedThumbnailUrl: 'https://cdn.example.com/selected-thumb.jpg',
        selectedThumbnailGenerationCandidateId: 'thumbnail-candidate-1',
        selectedDetailPageGenerationId: 'detail-generation-1',
        selectedDetailPageArtifactId: 'artifact-1',
        selectedDetailPageRevisionId: 'revision-1',
      },
    });

    expect(result).toEqual(expect.objectContaining({
      name: '상품 생성 입력명',
      category: '완구 > 보드게임',
      description: '상품 생성 설명',
      target: '초등학생',
      ageGroup: 'age-8-plus',
      tags: ['자석', '다트'],
      keywords: ['안전 다트'],
      optionNames: ['단품'],
      kcCertificationStatus: 'exists',
      kcCertificationNumber: 'CB061R1234-1001',
      productSize: '높이: 30cm',
      colorVariantStatus: 'multiple',
      colorVariantNames: '빨강, 파랑',
      boxSetStatus: 'box',
      boxSetQuantity: '1박스',
      salePrice: 12900,
      originalPrice: 15900,
      discountRate: 19,
      selectedThumbnailUrl: 'https://cdn.example.com/selected-thumb.jpg',
      selectedThumbnailGenerationCandidateId: 'thumbnail-candidate-1',
      selectedDetailPageGenerationId: 'detail-generation-1',
      selectedDetailPageArtifactId: 'artifact-1',
      selectedDetailPageRevisionId: 'revision-1',
    }));
  });

  it('falls back to collected source data when preparation input is missing', () => {
    const result = buildProductBasics({
      candidate: {
        id: 'candidate-1',
        name: '수집 상품명',
        description: '수집 설명',
        category: '수집 카테고리',
        tags: ['태그1'],
        rawData: { optionNames: ['옵션A'] },
        thumbnailUrl: 'https://cdn.example.com/source.jpg',
        imageUrl: 'https://cdn.example.com/source.jpg',
        images: [
          { url: 'https://cdn.example.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
        ],
      },
      preparation: null,
    });

    expect(result.name).toBe('수집 상품명');
    expect(result.category).toBe('수집 카테고리');
    expect(result.tags).toEqual(['태그1']);
    expect(result.optionNames).toEqual(['옵션A']);
    expect(result.thumbnailUrls).toEqual(['https://cdn.example.com/source.jpg']);
  });
});
