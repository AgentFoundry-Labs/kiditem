import { describe, expect, it } from 'vitest';
import {
  detailPageResultHref,
  normalizeStoredDetailPageRawInput,
  parseDetailPageStoredJson,
} from '../detail-page-stored.helpers';

describe('detail-page stored JSON helpers', () => {
  it('normalizes legacy or invalid stored raw input into a safe DetailPageRawInput', () => {
    const stored = parseDetailPageStoredJson(JSON.stringify({
      templateId: 'bold-vertical',
      rawInput: {
        rawTitle: '',
        rawCategory: 42,
        rawDescription: '상세 설명',
        rawOptions: null,
        imageUrls: ['https://example.com/legacy.jpg'],
        heroImageMode: 'invalid',
        ageGroup: 'teen',
        detailImageCount: 'seven',
        usageSectionMode: 'maybe',
        kcCertificationStatus: 'maybe',
        kcCertificationNumber: 12345,
      },
    }));

    expect(normalizeStoredDetailPageRawInput({
      stored,
      templateId: 'bold-vertical',
      productName: '대체 상품명',
      imageUrls: ['https://example.com/output.jpg'],
    })).toEqual({
      rawTitle: '대체 상품명',
      rawCategory: '',
      rawDescription: '상세 설명',
      rawOptions: '',
      imageUrls: ['https://example.com/output.jpg'],
      heroImageMode: 'first',
      templateId: 'bold-vertical',
      generationMode: 'full',
      baseContentGenerationId: undefined,
      ageGroup: 'age-8-plus',
      detailImageCount: 'auto',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      kcCertificationNumber: '',
    });
  });

  it('preserves valid stored audience controls and hero mode', () => {
    const stored = parseDetailPageStoredJson(JSON.stringify({
      templateId: 'kids-playful',
      rawInput: {
        rawTitle: '학생용 말랑이',
        rawCategory: '완구',
        rawDescription: '청소년 취미용',
        rawOptions: '2개 구성',
        imageUrls: ['https://example.com/input.jpg'],
        heroImageMode: 'llm-pick',
        ageGroup: 'age-14-plus',
        detailImageCount: '6',
        usageSectionMode: 'exclude',
        kcCertificationStatus: 'exists',
        kcCertificationNumber: 'CB061R1234-1001',
      },
    }));

    expect(normalizeStoredDetailPageRawInput({
      stored,
      templateId: 'kids-playful',
      productName: 'fallback',
      imageUrls: ['https://example.com/output.jpg'],
    })).toEqual({
      rawTitle: '학생용 말랑이',
      rawCategory: '완구',
      rawDescription: '청소년 취미용',
      rawOptions: '2개 구성',
      imageUrls: ['https://example.com/output.jpg'],
      heroImageMode: 'llm-pick',
      templateId: 'kids-playful',
      generationMode: 'full',
      baseContentGenerationId: undefined,
      ageGroup: 'age-14-plus',
      detailImageCount: '6',
      usageSectionMode: 'exclude',
      kcCertificationStatus: 'exists',
      kcCertificationNumber: 'CB061R1234-1001',
    });
  });

  it('builds canonical detail-page result links for the sourcing editor surface', () => {
    expect(detailPageResultHref({
      productId: 'product-123',
      contentGenerationId: 'generation-456',
      templateId: 'bold-vertical',
    })).toBe('/sourcing/detail-pages/generation-456/editor');
  });

  it('builds candidate-scoped detail-page result links when sourcing provenance exists', () => {
    expect(detailPageResultHref({
      productId: 'product-123',
      sourceCandidateId: 'candidate-123',
      contentGenerationId: 'generation-456',
      templateId: 'bold-vertical',
    })).toBe('/sourcing/candidate-123/editor?generationId=generation-456');
  });
});
