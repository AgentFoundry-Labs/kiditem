import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAiService } from '../detail-page-ai.service';
import { ContentAssetService } from '../content-asset.service';
import { DetailPageGenerationService } from '../detail-page-generation.service';
import { DetailPagePrefillService } from '../detail-page-prefill.service';
import { DetailPageQueryService } from '../detail-page-query.service';
import { DetailPageResultRefinerService } from '../detail-page-result-refiner.service';
import { BoldVerticalRefinerService } from '../bold-vertical-refiner.service';
import { KidsPlayfulRefinerService } from '../kids-playful-refiner.service';
import type { OperationAlertService } from '../../../../automation/application/service/operation-alert.service';
import type { AgentRunnerPort } from '../../../../agent-os/application/port/in/agent-runner.port';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-4444-444444444444';
const GENERATION_GROUP_ID = '55555555-5555-4555-8555-555555555555';
const CANDIDATE_ID = '66666666-6666-4666-8666-666666666666';

function makeOperationAlertsStub(): OperationAlertService {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  } as unknown as OperationAlertService;
}

function makeAgentRunnerStub(
  result: Awaited<ReturnType<AgentRunnerPort['runByType']>> = {
    ok: true,
    requestId: REQUEST_ID,
    agentType: 'detail_page_generate',
    agentInstanceId: 'agent-instance',
    status: 'pending',
  },
): AgentRunnerPort {
  return {
    runByType: vi.fn().mockResolvedValue(result),
    executeRequest: vi.fn().mockResolvedValue({
      executed: true,
      requestId: result.requestId,
      runId: 'agent-run',
    }),
    cancelBySource: vi.fn().mockResolvedValue({
      ok: true,
      cancelledRequests: 1,
      skippedRequests: 0,
    }),
  };
}

function makeResultRefiner(heroImageService?: unknown): DetailPageResultRefinerService {
  return new DetailPageResultRefinerService(
    new BoldVerticalRefinerService(heroImageService as never),
    new KidsPlayfulRefinerService(heroImageService as never),
  );
}

function makeService(
  prisma: unknown,
  textCompletion: unknown,
  imageStorage: unknown,
  operationAlerts: OperationAlertService,
  heroImageService?: unknown,
  agentRunner: AgentRunnerPort = makeAgentRunnerStub(),
): DetailPageAiService {
  const resultRefiner = makeResultRefiner(heroImageService);
  const contentAssets = new ContentAssetService(prisma as never);
  const query = new DetailPageQueryService(
    prisma as never,
    resultRefiner,
    imageStorage as never,
    contentAssets,
  );
  const generation = new DetailPageGenerationService(
    prisma as never,
    imageStorage as never,
    operationAlerts,
    query,
    agentRunner,
    contentAssets,
  );
  const prefill = new DetailPagePrefillService(textCompletion as never);
  return new DetailPageAiService(generation, prefill, query);
}

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
  const generationRow = makeGenerationRow();
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    masterProduct: {
      findFirst: vi.fn().mockResolvedValue({ id: MASTER_ID, name: '원본 상품명' }),
    },
    sourcingCandidate: {
      findFirst: vi.fn().mockResolvedValue({
        id: CANDIDATE_ID,
        name: '소싱 후보 상품',
        promotedMasterId: MASTER_ID,
      }),
    },
    contentGeneration: {
      findFirst: vi.fn().mockResolvedValue(generationRow),
      create: vi.fn().mockResolvedValue(generationRow),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentGenerationGroup: {
      findFirst: vi.fn().mockResolvedValue({ id: GENERATION_GROUP_ID }),
      create: vi.fn().mockResolvedValue({ id: GENERATION_GROUP_ID }),
    },
    contentGenerationSource: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contentGenerationAssetUsage: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    contentAsset: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  return prisma;
}

function makeGenerationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: GENERATION_ID,
    organizationId: ORGANIZATION_ID,
    generationGroupId: GENERATION_GROUP_ID,
    contentType: 'detail_page',
    templateId: 'bold-vertical',
    generationInput: {
      rawTitle: '원본 상품명',
      rawCategory: '',
      rawDescription: '',
      rawOptions: '',
      imageUrls: ['https://example.com/image.jpg'],
      heroImageMode: 'first',
      templateId: 'bold-vertical',
    },
    generationResult: {
      templateId: 'bold-vertical',
      result: {},
      imageUrls: ['https://example.com/image.jpg'],
      processedImages: {},
    },
    generatedTitle: '원본 상품명',
    generatedDescription: null,
    generatedCopy: null,
    editedHtml: null,
    editedHtmlSavedAt: null,
    status: 'PROCESSING',
    retryCount: 0,
    errorMessage: null,
    triggeredByUserId: USER_ID,
    createdAt: new Date('2026-05-04T00:00:00.000Z'),
    updatedAt: new Date('2026-05-04T00:00:00.000Z'),
    generationGroup: {
      id: GENERATION_GROUP_ID,
      targetMasterId: MASTER_ID,
    },
    ...overrides,
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

  it('product-bound generate creates a PROCESSING row, opens the alert, and enqueues a detail_page_generate request', async () => {
    const prisma = makePrisma();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const heroImageService = {
      // Pre-enqueue inference happens once on the producer side so the runtime
      // handler does not redo the expensive Gemini-vision call for the same
      // request. Returning [] (none) keeps this assertion simple.
      inferPackageImagePositions: vi.fn().mockResolvedValue([]),
    };
    const operationAlerts = makeOperationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      heroImageService,
      agentRunner,
    );

    const result = await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: ['https://example.com/detail-1.jpg'],
        ageGroup: 'age-14-plus',
        detailImageCount: '2',
        usageSectionMode: 'exclude',
        kcCertificationStatus: 'exists',
        kcCertificationNumber: 'CB061R1234-1001',
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        generationGroupId: GENERATION_GROUP_ID,
        contentType: 'detail_page',
        generationInput: expect.objectContaining({
          rawTitle: '휴대용목걸이비눗방울',
          imageUrls: ['https://example.com/detail-1.jpg'],
        }),
        generationResult: expect.objectContaining({
          templateId: 'bold-vertical',
          imageUrls: ['https://example.com/detail-1.jpg'],
          processedImages: {},
        }),
        triggeredByUserId: USER_ID,
        status: 'PROCESSING',
      }),
      include: expect.objectContaining({
        generationGroup: expect.any(Object),
      }),
    });
    // Runtime handler owns the LLM call now — service must not have reached out.
    expect(textCompletion.complete).not.toHaveBeenCalled();
    // Sink owns READY/FAILED writes — service must not have updated either.
    expect(prisma.contentGeneration.updateMany).not.toHaveBeenCalled();

    expect(agentRunner.runByType).toHaveBeenCalledWith(
      'detail_page_generate',
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceType: 'ai.detail_page_generate',
        sourceResourceType: 'content_generation',
        sourceResourceId: GENERATION_ID,
        payload: expect.objectContaining({
          templateId: 'bold-vertical',
          heroImageMode: 'llm-pick',
          raw: expect.objectContaining({
            rawTitle: '휴대용목걸이비눗방울',
            ageGroup: 'age-14-plus',
            detailImageCount: '2',
            usageSectionMode: 'exclude',
            kcCertificationStatus: 'exists',
            kcCertificationNumber: 'CB061R1234-1001',
          }),
        }),
      }),
    );
    expect(agentRunner.executeRequest).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'detail-page-generate-inline',
    });

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        href: `/sourcing/detail-pages/${GENERATION_ID}/editor`,
      }),
    );

    expect(result.id).toBe(GENERATION_ID);
    expect(result.imageProcessingStatus).toBe('processing');
    expect(result.productId).toBe(MASTER_ID);
  });

  it('stores the primary sourcing candidate directly on the ContentGeneration row', async () => {
    const prisma = makePrisma();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const operationAlerts = makeOperationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      undefined,
      agentRunner,
    );

    await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '소싱 후보 상품',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: ['https://example.com/detail-1.jpg'],
        sourceReferences: [
          {
            sourceType: 'sourcing_candidate',
            sourceCandidateId: CANDIDATE_ID,
          },
        ],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceCandidateId: CANDIDATE_ID,
        generationInput: expect.objectContaining({
          sourceReferences: [
            expect.objectContaining({
              sourceType: 'sourcing_candidate',
              sourceCandidateId: CANDIDATE_ID,
              label: '소싱 후보 상품',
            }),
          ],
        }),
      }),
      include: expect.objectContaining({
        generationGroup: expect.any(Object),
      }),
    });
    expect(prisma.contentGenerationSource.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          contentGenerationId: GENERATION_ID,
          sourceType: 'sourcing_candidate',
          sourceCandidateId: CANDIDATE_ID,
          label: '소싱 후보 상품',
        }),
      ]),
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        href: `/sourcing/${CANDIDATE_ID}/editor?generationId=${GENERATION_ID}`,
        metadata: expect.objectContaining({
          sourceCandidateId: CANDIDATE_ID,
        }),
      }),
    );
  });

  it('rejects product-bound generation without at least one product image', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    const service = makeService(
      prisma,
      { complete: vi.fn() },
      { save: vi.fn() },
      operationAlerts,
      undefined,
      agentRunner,
    );

    await expect(service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        imageUrls: [],
      },
      ORGANIZATION_ID,
      USER_ID,
    )).rejects.toMatchObject({
      response: {
        message: '상세페이지 생성에는 상품 이미지가 최소 1장 필요합니다.',
      },
    });

    expect(prisma.contentGeneration.create).not.toHaveBeenCalled();
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(agentRunner.runByType).not.toHaveBeenCalled();
  });

  it('cancels a processing product-bound generation and closes its alert', async () => {
    const prisma = makePrisma();
    prisma.contentGeneration.findFirst
      .mockResolvedValueOnce(makeGenerationRow({ status: 'PROCESSING' }))
      .mockResolvedValueOnce(makeGenerationRow({
        status: 'CANCELLED',
        errorMessage: '사용자 요청으로 생성이 중단되었습니다.',
      }));
    const operationAlerts = makeOperationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    const service = makeService(
      prisma,
      { complete: vi.fn() },
      { save: vi.fn() },
      operationAlerts,
      undefined,
      agentRunner,
    );

    const result = await service.cancel(GENERATION_ID, ORGANIZATION_ID);

    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: {
        id: GENERATION_ID,
        organizationId: ORGANIZATION_ID,
        status: { in: ['PENDING', 'PROCESSING', 'generating', 'pending', 'processing'] },
      },
      data: {
        status: 'CANCELLED',
        errorMessage: '사용자 요청으로 생성이 중단되었습니다.',
      },
    });
    expect(agentRunner.cancelBySource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceType: 'ai.detail_page_generate',
      sourceResourceType: 'content_generation',
      sourceResourceId: GENERATION_ID,
      reason: '사용자 요청으로 생성이 중단되었습니다.',
    });
    expect(operationAlerts.cancel).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${GENERATION_ID}`,
      expect.objectContaining({
        message: '사용자 요청으로 생성이 중단되었습니다.',
        metadata: { errorCode: 'user_cancelled' },
      }),
    );
    expect(result.imageProcessingStatus).toBe('cancelled');
  });

  it('uses inferred package images only in the package section for bold vertical', async () => {
    const refiner = makeResultRefiner({
      inferPackageImagePositions: vi.fn().mockResolvedValue([3]),
    });

    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: {
          ...boldVerticalResult().hook,
          imageIndex: 3,
        },
        keyPoints: [
          { title: '박스 구성', description: '구성을 확인하세요', imageIndex: 3 },
        ],
        size: {
          ...boldVerticalResult().size,
          imageIndices: [3],
        },
        usage: {
          subtitle: '1. 포장을 열고 젤리를 꺼내세요\n2. 쫄깃하게 즐겨보세요',
          imageIndices: [3],
        },
        detailImageIndices: [0, 3],
        packageImageIndices: [2],
        packageLabel: '1박스 12개입 구성',
      },
      {
        templateId: 'bold-vertical',
        rawTitle: '퐁퐁 젤리팝',
        rawCategory: '식품/간식/과자/젤리',
        rawDescription: '박스/세트 정보: 있음\n박스/세트 구분: 박스',
        rawOptions: '색상 구성: 없음\n박스/세트 정보: 있음\n1박스 수량: 12',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/product-detail.jpg',
          'https://example.com/color-row.jpg',
          'https://example.com/retail-box.jpg',
        ],
        detailImageCount: '2',
        usageSectionMode: 'include',
      },
    );

    expect(parsed.packageImageIndices).toEqual([3]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.keyPoints[0]?.imageIndex).toBeNull();
    expect(parsed.size.imageIndices).toEqual([]);
    expect(parsed.usage.imageIndices).toEqual([]);
    expect(parsed.detailImageIndices).toEqual([0]);
    expect(parsed.packageLabel).toBe('1박스 12개입 구성');
  });

  it('prefers inferred retail display boxes over LLM-selected color lineups for package sections', async () => {
    const refiner = makeResultRefiner({
      inferPackageImagePositions: vi.fn().mockResolvedValue([0]),
    });

    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: {
          ...boldVerticalResult().hook,
          imageIndex: 0,
        },
        color: {
          subtitle: '옐로우 / 퍼플 / 블루 / 핑크 4가지 색상',
          imageIndices: [3],
        },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 마음껏 만지고 늘리며 즐기세요',
          imageIndices: [0, 1],
        },
        detailImageIndices: [0, 1, 2, 3],
        packageImageIndices: [3],
        packageLabel: '1박스 12개입 구성',
      },
      {
        templateId: 'bold-vertical',
        rawTitle: '퐁퐁 버블팝슬라임',
        rawCategory: '완구',
        rawDescription: '박스/세트 정보: 있음\n박스/세트 구분: 박스',
        rawOptions: '색상 구성: 여러 색상\n박스/세트 정보: 있음\n1박스 수량: 12',
        imageUrls: [
          'https://example.com/display-box.jpg',
          'https://example.com/hand-product.jpg',
          'https://example.com/usage-shot.jpg',
          'https://example.com/color-lineup.jpg',
        ],
        detailImageCount: '3',
        usageSectionMode: 'include',
      },
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.color.imageIndices).toEqual([3]);
    expect(parsed.usage.imageIndices).toEqual([1]);
    expect(parsed.detailImageIndices).toEqual([1, 2, 3]);
    expect(parsed.packageLabel).toBe('1박스 12개입 구성');
  });

  it('repairs LLM package-color collisions when package inference has no confident hit', async () => {
    const refiner = makeResultRefiner({
      inferPackageImagePositions: vi.fn().mockResolvedValue([]),
    });

    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        hook: {
          ...boldVerticalResult().hook,
          imageIndex: 0,
        },
        color: {
          subtitle: '옐로우 / 퍼플 / 블루 / 핑크 4가지 색상',
          imageIndices: [3],
        },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 마음껏 만지고 늘리며 즐기세요',
          imageIndices: [0, 1],
        },
        detailImageIndices: [0, 1, 2, 3],
        packageImageIndices: [3],
        packageLabel: '1박스 12개입 구성',
      },
      {
        templateId: 'bold-vertical',
        rawTitle: '퐁퐁 버블팝슬라임',
        rawCategory: '완구',
        rawDescription: '박스/세트 정보: 있음\n박스/세트 구분: 박스',
        rawOptions: '색상 구성: 여러 색상\n박스/세트 정보: 있음\n1박스 수량: 12',
        imageUrls: [
          'https://example.com/display-box.jpg',
          'https://example.com/hand-product.jpg',
          'https://example.com/usage-shot.jpg',
          'https://example.com/color-lineup.jpg',
        ],
        detailImageCount: '3',
        usageSectionMode: 'include',
      },
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.hook.imageIndex).toBeNull();
    expect(parsed.color.imageIndices).toEqual([3]);
    expect(parsed.usage.imageIndices).toEqual([1]);
    expect(parsed.detailImageIndices).toEqual([1, 2]);
    expect(parsed.packageLabel).toBe('1박스 12개입 구성');
  });

  it('does not promote package-opening usage product photos into package images', async () => {
    const refiner = makeResultRefiner({
      inferPackageImagePositions: vi.fn().mockResolvedValue([]),
    });

    const parsed = await refiner.refineBoldVerticalGeneration(
      {
        ...boldVerticalResult(),
        color: {
          subtitle: '',
          imageIndices: [],
        },
        usage: {
          subtitle: '1. 포장을 열고 슬라임을 꺼내세요\n2. 손으로 주무르며 버블팝을 즐기세요',
          imageIndices: [1, 2],
        },
        detailImageIndices: [1, 2],
        packageImageIndices: [0],
        packageLabel: '1박스 12개입 구성',
      },
      {
        templateId: 'bold-vertical',
        rawTitle: '퐁퐁 버블팝슬라임',
        rawCategory: '완구',
        rawDescription: '박스/세트 정보: 있음\n박스/세트 구분: 박스',
        rawOptions: '색상 구성: 없음\n박스/세트 정보: 있음\n1박스 수량: 12',
        imageUrls: [
          'https://example.com/display-box.jpg',
          'https://example.com/hand-product.jpg',
          'https://example.com/detail-shot.jpg',
        ],
        detailImageCount: '2',
        usageSectionMode: 'include',
      },
    );

    expect(parsed.packageImageIndices).toEqual([0]);
    expect(parsed.usage.imageIndices).toEqual([1, 2]);
    expect(parsed.detailImageIndices).toEqual([1, 2]);
    expect(parsed.packageLabel).toBe('1박스 12개입 구성');
  });

  it('marks the row FAILED and closes the alert when AgentRunCoordinator rejects the enqueue', async () => {
    // Producer-side enqueue failure (eg. agent_instance_not_found) — the AI
    // service must not leave a stranded PROCESSING row and must close the
    // operation alert it just opened. Runtime/LLM-level failures arrive via
    // the bridge + sink and are covered separately by the sink spec.
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const heroImageService = {
      inferPackageImagePositions: vi.fn().mockResolvedValue([]),
    };
    const agentRunner = makeAgentRunnerStub({
      ok: false,
      reason: 'agent_instance_not_found',
      agentType: 'detail_page_generate',
    });
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      heroImageService,
      agentRunner,
    );

    await expect(
      service.generate(
        {
          productId: MASTER_ID,
          rawTitle: '키즈 텀블러 500ml',
          rawCategory: '유아용품',
          rawDescription: '아이가 사용하기 좋은 텀블러',
          rawOptions: '핑크, 블루',
          imageUrls: ['https://cdn.example.com/p1.png'],
          heroImageMode: 'first',
          templateId: 'kids-playful',
        },
        ORGANIZATION_ID,
        USER_ID,
      ),
    ).rejects.toThrow(/Agent OS enqueue failed/);

    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        generationGroupId: GENERATION_GROUP_ID,
        contentType: 'detail_page',
        triggeredByUserId: USER_ID,
        status: 'PROCESSING',
      }),
      include: expect.objectContaining({
        generationGroup: expect.any(Object),
      }),
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        href: `/sourcing/detail-pages/${GENERATION_ID}/editor`,
      }),
    );
    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(agentRunner.executeRequest).not.toHaveBeenCalled();
    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${GENERATION_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({ errorCode: 'agent_enqueue_failed' }),
      }),
    );
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
  });

  it('product-less generate creates an unbound ContentGeneration, starts an alert, and enqueues Agent OS', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    prisma.contentGenerationGroup.findFirst.mockResolvedValueOnce(null);
    prisma.contentGeneration.create.mockResolvedValueOnce({
      ...makeGenerationRow({
        generationGroupId: GENERATION_GROUP_ID,
        templateId: 'kids-playful',
        generationInput: {
          rawTitle: 'standalone',
          rawCategory: '',
          rawDescription: '',
          rawOptions: '',
          imageUrls: ['https://example.com/standalone.jpg'],
          heroImageMode: 'first',
          templateId: 'kids-playful',
        },
        generationResult: {
          templateId: 'kids-playful',
          result: {},
          imageUrls: ['https://example.com/standalone.jpg'],
          processedImages: {},
        },
        generatedTitle: 'standalone',
        generationGroup: {
          id: GENERATION_GROUP_ID,
          targetMasterId: null,
        },
      }),
    });
    prisma.contentGeneration.findFirst.mockResolvedValue(makeGenerationRow({
      generationGroupId: GENERATION_GROUP_ID,
      templateId: 'kids-playful',
      generationInput: {
        rawTitle: 'standalone',
        rawCategory: '',
        rawDescription: '',
        rawOptions: '',
        imageUrls: ['https://example.com/standalone.jpg'],
        heroImageMode: 'first',
        templateId: 'kids-playful',
      },
      generationResult: {
        templateId: 'kids-playful',
        result: {},
        imageUrls: ['https://example.com/standalone.jpg'],
        processedImages: {},
      },
      generatedTitle: 'standalone',
      generationGroup: {
        id: GENERATION_GROUP_ID,
        targetMasterId: null,
      },
    }));
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const agentRunner = makeAgentRunnerStub();
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      undefined,
      agentRunner,
    );

    const result = await service.generate(
      {
        rawTitle: 'standalone',
        rawCategory: '',
        rawDescription: '',
        rawOptions: '',
        imageUrls: ['https://example.com/standalone.jpg'],
        heroImageMode: 'first',
        templateId: 'kids-playful',
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(prisma.masterProduct.findFirst).not.toHaveBeenCalled();
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        contentType: 'detail_page',
        generationGroupId: GENERATION_GROUP_ID,
        triggeredByUserId: USER_ID,
        status: 'PROCESSING',
      }),
      include: expect.objectContaining({
        generationGroup: expect.any(Object),
      }),
    });
    expect(prisma.contentGenerationGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        groupType: 'input_variation',
        title: 'standalone',
        createdByUserId: USER_ID,
      }),
      select: { id: true },
    });
    expect(textCompletion.complete).not.toHaveBeenCalled();
    expect(agentRunner.runByType).toHaveBeenCalledWith(
      'detail_page_generate',
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        sourceResourceType: 'content_generation',
        sourceResourceId: GENERATION_ID,
        reason: `detail_page_generate for unbound content ${GENERATION_ID}`,
      }),
    );
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        targetType: 'content_generation',
        targetId: GENERATION_ID,
        href: `/sourcing/detail-pages/${GENERATION_ID}/editor`,
      }),
    );
    expect(operationAlerts.fail).not.toHaveBeenCalled();
    expect(result.productId).toBeNull();
    expect(result.imageProcessingStatus).toBe('processing');
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
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      makeOperationAlertsStub(),
    );

    const result = await service.prefill(
      {
        rawTitle: '휴대용목걸이비눗방울',
        imageUrls: ['https://example.com/image.jpg'],
      },
      ORGANIZATION_ID,
      USER_ID,
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
