import { describe, expect, it } from 'vitest';
import { buildDirectDetailGenerationBody } from './direct-detail-generation';

describe('buildDirectDetailGenerationBody', () => {
  it('builds a direct detail-page generation request from the current row input', () => {
    const body = buildDirectDetailGenerationBody({
      generationRawInput: {
        rawTitle: '쭉쭉붙이는터치등',
        rawCategory: '생활용품',
        rawDescription: '기존 설명',
        rawOptions: '기존 옵션',
        imageUrls: ['https://cdn.example.com/a.jpg'],
        heroImageMode: 'llm-pick',
        ageGroup: 'age-8-plus',
        detailImageCount: '2',
        usageSectionMode: 'include',
        kcCertificationStatus: 'unknown',
      },
      productName: '쭉쭉붙이 는터치등!',
      productId: 'product-1',
      contentWorkspaceId: 'workspace-1',
      contentGenerationId: 'generation-1',
      templateId: 'bold-vertical',
    });

    expect(body).toMatchObject({
      rawTitle: '쭉쭉붙이는터치등',
      rawCategory: '생활용품',
      rawDescription: '기존 설명',
      rawOptions: '기존 옵션',
      imageUrls: ['https://cdn.example.com/a.jpg'],
      heroImageMode: 'llm-pick',
      productId: 'product-1',
      contentWorkspaceId: 'workspace-1',
      templateId: 'bold-vertical',
      generationMode: 'full',
      ageGroup: 'age-8-plus',
      detailImageCount: '2',
      usageSectionMode: 'include',
      kcCertificationStatus: 'unknown',
      sourceReferences: [
        {
          sourceType: 'content_generation',
          sourceContentGenerationId: 'generation-1',
          label: 'editor-regenerate',
        },
      ],
    });
  });

  it('folds user-selected hero and color image hints into the direct request', () => {
    const body = buildDirectDetailGenerationBody({
      generationRawInput: {
        rawTitle: '기존 상품',
        rawDescription: '',
        rawOptions: '',
        imageUrls: ['https://cdn.example.com/a.jpg'],
      },
      productName: '기존 상품!',
      seedHookText: '방 안에 톡',
      seedHookTitleSub: '붙이는 조명',
      seedHeroImage: 'https://cdn.example.com/hero.jpg',
      colorGuideEnabled: true,
      colorImageUrls: ['https://cdn.example.com/color.jpg', 'https://cdn.example.com/a.jpg'],
    });

    expect(body.imageUrls).toEqual([
      'https://cdn.example.com/hero.jpg',
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/color.jpg',
    ]);
    expect(body.rawDescription).toContain('사용자 제목 힌트 1: 방 안에 톡');
    expect(body.rawDescription).toContain('사용자 제목 힌트 2: 붙이는 조명');
    expect(body.rawOptions).toContain('사용자가 선택한 히어로 이미지를 우선 반영하세요.');
    expect(body.rawOptions).toContain('사용자가 선택한 색상 안내 이미지를 색상/옵션 안내에 우선 반영하세요.');
  });

  it('sanitizes fallback product names for server title validation', () => {
    const body = buildDirectDetailGenerationBody({
      generationRawInput: {},
      productName: '쭉쭉붙이 는터치등!',
      templateId: 'unknown',
    });

    expect(body.rawTitle).toBe('쭉쭉붙이 는터치등');
    expect(body.templateId).toBe('bold-vertical');
  });
});
