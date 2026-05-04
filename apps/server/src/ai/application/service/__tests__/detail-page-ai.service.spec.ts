import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAiService } from '../detail-page-ai.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

function simpleVerticalResult() {
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
    detailImageIndices: [0],
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
          templateId: 'simple-vertical',
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
        text: JSON.stringify(simpleVerticalResult()),
      }),
    };
    const service = new DetailPageAiService(prisma as never, textCompletion);

    await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'simple-vertical',
        rawTitle: '원본 상품명',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상',
        imageUrls: ['https://example.com/image.jpg'],
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
    expect(prisma.contentGeneration.update).not.toHaveBeenCalled();
  });
});
