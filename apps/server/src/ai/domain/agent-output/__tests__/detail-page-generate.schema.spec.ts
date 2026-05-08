import { describe, expect, it } from 'vitest';
import {
  DetailPageGenerateAgentOutputSchema,
  DetailPageGenerateAgentInputSchema,
} from '../detail-page-generate.schema';

describe('DetailPageGenerateAgentOutputSchema', () => {
  // Kids-playful happy-path is exercised through the existing 11-section
  // schemas (`detail-page/section-*`); this suite only verifies the
  // discriminatedUnion wrapper and the cross-section glue, so we keep the
  // bold-vertical case as the canonical "valid" example. Adding a fully
  // schema-conformant kids-playful fixture here would duplicate the section
  // schemas' own tests and drift whenever any section tightens its rules.

  it('accepts a bold-vertical output with the minimum required fields', () => {
    const parsed = DetailPageGenerateAgentOutputSchema.safeParse({
      templateId: 'bold-vertical',
      result: {
        hook: {
          subtext: '여름 필수템',
          text: '더블샷',
          titleSub: '슈퍼워터건',
          description: '아이가 신나게 노는\n여름의 시작',
          imageIndex: 0,
          bannerImageIndex: 1,
        },
        section: { name: '더블샷', title: '슈퍼워터건', subtitle: '핵심 포인트' },
        keyPoints: [
          {
            title: '튼튼한 본체',
            description: '오래 쓰는 재질로 만들었어요',
            imageIndex: 2,
          },
          {
            title: '먼 사거리',
            description: '경쟁 제품보다 더 멀리 쏘아요',
            imageIndex: 3,
          },
          {
            title: '간편 충전',
            description: '한 번 넣으면 오래 발사돼요',
            imageIndex: 4,
          },
        ],
        size: { subtitle: '아이 손 사이즈', imageIndices: [5] },
        color: { subtitle: '비비드 4색', imageIndices: [6, 7] },
        usage: { subtitle: '쉽고 안전한 사용법', imageIndices: [8] },
        detailImageIndices: [9, 10],
        productInfo: [
          { key: '제품명', value: '더블샷 슈퍼워터건' },
          { key: '사이즈', value: '24cm' },
          { key: '재질', value: 'ABS' },
        ],
      },
      imageUrls: ['https://example.com/0.jpg'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects when templateId is missing', () => {
    const parsed = DetailPageGenerateAgentOutputSchema.safeParse({
      result: {},
      imageUrls: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects when the inner result does not match the templateId schema', () => {
    const parsed = DetailPageGenerateAgentOutputSchema.safeParse({
      templateId: 'bold-vertical',
      result: { not: 'a valid bold vertical result' },
      imageUrls: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('DetailPageGenerateAgentInputSchema', () => {
  it('fills in default heroImageMode when missing', () => {
    const parsed = DetailPageGenerateAgentInputSchema.parse({
      templateId: 'kids-playful',
      raw: { rawTitle: 'product' },
    });
    expect(parsed.heroImageMode).toBe('first');
    expect(parsed.raw.imageUrls).toEqual([]);
  });

  it('rejects unknown templateId', () => {
    const parsed = DetailPageGenerateAgentInputSchema.safeParse({
      templateId: 'unknown',
      raw: { rawTitle: 'product' },
    });
    expect(parsed.success).toBe(false);
  });
});
