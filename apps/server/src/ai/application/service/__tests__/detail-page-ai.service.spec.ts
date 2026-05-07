import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAiService } from '../detail-page-ai.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

function boldVerticalResult() {
  return {
    hook: {
      subtext: '이달의 추천',
      text: '키즈 장난감',
      titleSub: '즐거운 놀이',
      description: '아이와 함께 즐기는 놀이',
      imageIndex: 0,
      bannerImageIndex: null,
    },
    section: {
      name: '놀이 포인트',
      title: '핵심 장점',
      subtitle: '가볍게 즐기는 실내놀이',
    },
    keyPoints: [
      { title: '쉬운 사용', description: '아이도 쉽게 다룰 수 있어요', imageIndex: 0 },
      { title: '가벼운 무게', description: '들고 놀기 부담이 없어요', imageIndex: 0 },
      { title: '선물 추천', description: '특별한 날 선물로 좋아요', imageIndex: 0 },
    ],
    size: { subtitle: '상세페이지 참고', imageIndices: [] },
    color: { subtitle: '혼합 색상', imageIndices: [] },
    usage: { subtitle: '간단하게 바로 사용', imageIndices: [] },
    detailImageIndices: [0, 1, 2],
    productInfo: [
      { key: '제품명', value: '키즈 장난감' },
      { key: '재질', value: '플라스틱' },
      { key: '색상', value: '혼합 색상' },
    ],
  };
}

function makePrisma() {
  return {
    masterProduct: {
      findFirst: vi.fn().mockResolvedValue({ id: MASTER_ID }),
    },
    contentGeneration: {
      create: vi.fn().mockResolvedValue({
        id: GENERATION_ID,
        masterId: MASTER_ID,
        originalImages: ['https://example.com/image.jpg'],
        processedImages: {},
        generatedTitle: '원본 상품명',
        detailPageHtml: JSON.stringify({
          templateId: 'bold-vertical',
          result: {},
          imageUrls: ['https://example.com/image.jpg'],
          rawInput: { rawTitle: '원본 상품명' },
        }),
        status: 'PROCESSING',
        errorMessage: null,
        createdAt: new Date('2026-05-04T00:00:00.000Z'),
      }),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('DetailPageAiService', () => {
  const previousModel = process.env.AI_TEXT_MODEL;

  beforeEach(() => {
    process.env.AI_TEXT_MODEL = 'gemini-test';
  });

  afterEach(() => {
    process.env.AI_TEXT_MODEL = previousModel;
    vi.restoreAllMocks();
  });

  it('scopes stored generation completion updates by organizationId', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify(boldVerticalResult()),
      }),
    };
    const imageStorage = {
      save: vi.fn(),
    };
    const heroImageService = {
      inferColorSubtitle: vi.fn().mockResolvedValue('민트 / 핑크 / 옐로우 3가지 색상'),
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/generated-hero.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/generated-size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/generated-color.png'),
      inferPackageImagePositions: vi.fn().mockResolvedValue([1]),
      generateDetailCutImage: vi.fn()
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-1.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-2.png'),
    };
    const service = new DetailPageAiService(
      prisma as never,
      textCompletion,
      imageStorage,
      heroImageService as never,
    );

    await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: [
          'https://example.com/detail-1.jpg',
          'https://example.com/package-box.jpg',
          'https://example.com/detail-2.jpg',
        ],
      },
      ORGANIZATION_ID,
    );

    await vi.waitFor(() => {
      expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: GENERATION_ID, organizationId: ORGANIZATION_ID },
        }),
      );
    });
    const updateArg = prisma.contentGeneration.updateMany.mock.calls.find(
      ([arg]) => arg.data?.status === 'READY',
    )?.[0];
    const stored = JSON.parse(updateArg?.data?.detailPageHtml ?? '{}');
    expect(updateArg?.data?.generatedTitle).toBe('휴대용 목걸이 비눗방울!');
    expect(stored.result.hook.text).toBe('휴대용 목걸이');
    expect(stored.result.hook.titleSub).toBe('비눗방울!');
    expect(stored.result.section.name).toBe('휴대용 목걸이');
    expect(stored.result.section.title).toBe('비눗방울!');
    expect(stored.result.color.subtitle).toBe('민트 / 핑크 / 옐로우 3가지 색상');
    expect(stored.result.size.heightLabel).toBe('60mm');
    expect(stored.result.size.widthLabel).toBe('85mm');
    expect(stored.result.productInfo).toContainEqual({
      key: '제품명',
      value: '휴대용 목걸이 비눗방울',
    });
    expect(stored.result.productInfo).toContainEqual({
      key: '색상',
      value: '민트 / 핑크 / 옐로우 3가지 색상',
    });
    expect(stored.result.detailImageIndices).toEqual([0, 2, 1]);
    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processedImages: {
            __heroBanner: 'https://cdn.example.com/generated-hero.png',
            __sizeGuideImage: 'https://cdn.example.com/generated-size.png',
            __colorGuideImage: 'https://cdn.example.com/generated-color.png',
            __detailImage1: 'https://cdn.example.com/generated-detail-1.png',
            __detailImage2: 'https://cdn.example.com/generated-detail-2.png',
          },
        }),
      }),
    );
    expect(heroImageService.generateSizeGuideImage).toHaveBeenCalledWith(
      expect.objectContaining({
        heightLabel: '60mm',
        widthLabel: '85mm',
      }),
    );
    expect(prisma.contentGeneration.update).not.toHaveBeenCalled();
  });

  it('suppresses generated product info table when a KC safety label image exists', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify(boldVerticalResult()),
      }),
    };
    const imageStorage = {
      save: vi.fn(),
    };
    const service = new DetailPageAiService(
      prisma as never,
      textCompletion,
      imageStorage,
    );

    const result = await service.generate(
      {
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: [
          'https://example.com/product.jpg',
          'https://example.com/detail-page-inputs/org/safety-label-kc.jpg',
        ],
      },
      ORGANIZATION_ID,
    );

    expect((result.result as ReturnType<typeof boldVerticalResult>).productInfo).toEqual([]);
  });

  it('does not create package section when direct generator marks box set as absent', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify(boldVerticalResult()),
      }),
    };
    const imageStorage = {
      save: vi.fn(),
    };
    const heroImageService = {
      inferColorImageSelection: vi.fn().mockResolvedValue([]),
      inferColorSubtitle: vi.fn().mockResolvedValue('핑크 단일 색상'),
      inferPackageImagePositions: vi.fn().mockResolvedValue([1]),
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/generated-hero.png'),
      generateSizeGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/generated-size.png'),
      generateColorGuideImage: vi.fn().mockResolvedValue('https://cdn.example.com/generated-color.png'),
      generateDetailCutImage: vi.fn()
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-1.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-2.png'),
    };
    const service = new DetailPageAiService(
      prisma as never,
      textCompletion,
      imageStorage,
      heroImageService as never,
    );

    const result = await service.generate(
      {
        templateId: 'bold-vertical',
        rawTitle: '고양이 꾹꾹 베개말랑이',
        rawCategory: '완구',
        rawDescription: '부드러운 말랑이 장난감',
        rawOptions: '박스/세트 정보: 없음',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/package-like-photo.jpg',
        ],
      },
      ORGANIZATION_ID,
    );

    const parsed = result.result as ReturnType<typeof boldVerticalResult> & {
      packageImageIndices?: number[];
      packageLabel?: string;
    };
    expect(parsed.packageImageIndices).toEqual([]);
    expect(parsed.packageLabel).toBe('');
    expect(heroImageService.inferPackageImagePositions).not.toHaveBeenCalled();
  });

  it('prefills direct generator fields from a product name', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: '생활용품/리빙',
          target: '부모 구매자',
          features: [
            '목에 걸고 다니기 쉬운 휴대형 비눗방울',
            '버튼 조작으로 아이가 간편하게 사용할 수 있는 놀이 아이템',
            '야외 활동과 생일 파티에 어울리는 선물 구성',
          ],
          options: ['노란색', '빨간색', '초록색'],
          extraNotes: '사용연령과 안전표시 이미지는 상세 하단에 분리 배치',
        }),
      }),
    };
    const imageStorage = {
      save: vi.fn(),
    };
    const service = new DetailPageAiService(
      prisma as never,
      textCompletion,
      imageStorage,
    );

    const result = await service.prefill(
      {
        rawTitle: '휴대용목걸이비눗방울',
        imageUrls: ['https://example.com/image.jpg'],
      },
      ORGANIZATION_ID,
    );

    expect(textCompletion.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        responseMimeType: 'application/json',
        temperature: 0.45,
      }),
    );
    expect(result.category).toBe('생활용품/리빙');
    expect(result.target).toBe('부모 구매자');
    expect(result.description).toContain('1. 목에 걸고 다니기 쉬운 휴대형 비눗방울');
    expect(result.options).toEqual(['노란색', '빨간색', '초록색']);
  });
});
