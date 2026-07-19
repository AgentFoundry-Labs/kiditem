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
          thumbnailUrls: [
            'https://cdn.example.com/selected-thumb.jpg',
            'https://cdn.example.com/preview-2.jpg',
          ],
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
      thumbnailPreviewUrls: [
        'https://cdn.example.com/selected-thumb.jpg',
        'https://cdn.example.com/preview-2.jpg',
      ],
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
    expect(result.thumbnailPreviewUrls).toEqual([]);
  });

  describe('salePrice 셀피아 폴백', () => {
    const candidate = {
      id: 'candidate-1',
      name: '4000과일바구니딸깍이키링',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: null,
      imageUrl: null,
      images: [],
    };

    it('수기 입력 판매가가 있으면 셀피아 값을 무시한다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: { salePrice: 12900 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
        sellpiaSalePrice: 4000,
      });

      // 사용자가 고친 값을 폴백이 덮어쓰면 안 된다.
      expect(result.salePrice).toBe(12900);
      expect(result.salePriceSource).toBe('input');
    });

    it('수기 입력이 없으면 셀피아 판매가로 폴백한다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: {
          registrationInput: { salePrice: 0 },
          selectedThumbnailUrl: null,
          selectedDetailPageGenerationId: null,
        },
        sellpiaSalePrice: 4000,
      });

      expect(result.salePrice).toBe(4000);
      expect(result.salePriceSource).toBe('sellpia');
    });

    it('둘 다 없으면 0원으로 남기고 추정하지 않는다', () => {
      const result = buildProductBasics({
        candidate,
        preparation: null,
        sellpiaSalePrice: null,
      });

      expect(result.salePrice).toBe(0);
      expect(result.salePriceSource).toBe('none');
    });
  });

  describe('registrationImages', () => {
    const candidate = {
      id: 'candidate-1',
      name: '수집 상품명',
      description: null,
      category: null,
      tags: [],
      rawData: {},
      thumbnailUrl: 'https://cbu01.alicdn.com/source.jpg',
      imageUrl: 'https://cbu01.alicdn.com/source.jpg',
      images: [
        { url: 'https://cbu01.alicdn.com/source.jpg', sortOrder: 0, role: 'product', isPrimary: true },
      ],
    };

    it('carries role-split content assets through untouched', () => {
      const result = buildProductBasics({
        candidate,
        preparation: null,
        registrationImages: {
          primary: ['http://localhost:9000/a/primary.png'],
          thumbnail: ['http://localhost:9000/a/thumb.png'],
          detail: ['http://localhost:9000/a/detail.png'],
        },
      });

      expect(result.registrationImages).toEqual({
        primary: ['http://localhost:9000/a/primary.png'],
        thumbnail: ['http://localhost:9000/a/thumb.png'],
        detail: ['http://localhost:9000/a/detail.png'],
      });
    });

    it('returns empty role buckets rather than substituting the scrape original', () => {
      const result = buildProductBasics({ candidate, preparation: null });

      expect(result.registrationImages).toEqual({ primary: [], thumbnail: [], detail: [] });
      // 폴백은 호출자 몫이다. 프리젠터가 원본 이미지를 role 자산인 척 넣으면 안 된다.
      expect(result.registrationImages.primary).not.toContain('https://cbu01.alicdn.com/source.jpg');
    });
  });
});
