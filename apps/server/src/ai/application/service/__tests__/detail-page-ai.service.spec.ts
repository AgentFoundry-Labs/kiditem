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
import type { ProductGenerationAlertService } from '../product-generation-alert.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '99999999-9999-9999-9999-999999999999';
const MASTER_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-4444-444444444444';
const GENERATION_GROUP_ID = '55555555-5555-4555-8555-555555555555';
const CANDIDATE_ID = '66666666-6666-4666-8666-666666666666';
const REGISTRATION_WORKSPACE_ID = '77777777-7777-4777-8777-777777777777';
const LOADED_REGISTRATION_WORKSPACE_ID = '77777777-7777-4777-8777-888888888888';

function makeOperationAlertsStub(): OperationAlertService {
  return {
    start: vi.fn().mockResolvedValue({}),
    succeed: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    progress: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
  } as unknown as OperationAlertService;
}

function makeProductGenerationAlertsStub(): ProductGenerationAlertService {
  return {
    start: vi.fn().mockResolvedValue({}),
    recordChildStarted: vi.fn().mockResolvedValue({}),
    markChildFinished: vi.fn().mockResolvedValue({}),
  } as unknown as ProductGenerationAlertService;
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

async function flushInlineExecutor() {
  await new Promise((resolve) => setImmediate(resolve));
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
  contentWorkspaces: { ensureForGeneration: ReturnType<typeof vi.fn> } = {
    ensureForGeneration: vi.fn(async () => ({
      id: REGISTRATION_WORKSPACE_ID,
      displayName: 'Generated candidate',
      normalizedTitle: 'generated candidate',
    })),
  },
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
    contentWorkspaces as never,
    makeProductGenerationAlertsStub(),
  );
  const prefill = new DetailPagePrefillService(textCompletion as never);
  return new DetailPageAiService(generation, prefill, query);
}

function makeGenerationService(input: {
  prisma: ReturnType<typeof makePrisma>;
  textCompletion?: unknown;
  imageStorage?: unknown;
  operationAlerts?: OperationAlertService;
  heroImageService?: unknown;
  agentRunner?: AgentRunnerPort;
  contentWorkspaces?: { ensureForGeneration: ReturnType<typeof vi.fn> };
  productGenerationAlerts?: ProductGenerationAlertService;
}) {
  const resultRefiner = makeResultRefiner(input.heroImageService);
  const imageStorage = input.imageStorage ?? { save: vi.fn() };
  const contentAssets = new ContentAssetService(input.prisma as never);
  const query = new DetailPageQueryService(
    input.prisma as never,
    resultRefiner,
    imageStorage as never,
    contentAssets,
  );
  return new DetailPageGenerationService(
    input.prisma as never,
    imageStorage as never,
    input.operationAlerts ?? makeOperationAlertsStub(),
    query,
    input.agentRunner ?? makeAgentRunnerStub(),
    contentAssets,
    input.contentWorkspaces ?? {
      ensureForGeneration: vi.fn(async () => ({
        id: REGISTRATION_WORKSPACE_ID,
        displayName: 'Generated candidate',
        normalizedTitle: 'generated candidate',
      })),
    } as never,
    input.productGenerationAlerts ?? makeProductGenerationAlertsStub(),
  );
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
      findMany: vi.fn().mockResolvedValue([generationRow]),
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
        targetType: 'content_workspace',
        targetId: REGISTRATION_WORKSPACE_ID,
        href: `/product-pipeline/detail-pages/${GENERATION_ID}/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${REGISTRATION_WORKSPACE_ID}`,
      }),
    );

    expect(result.id).toBe(GENERATION_ID);
    expect(result.imageProcessingStatus).toBe('processing');
    expect(result.productId).toBe(MASTER_ID);
  });

  it('suppresses child detail operation alert when linked to product generation parent', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    const service = makeGenerationService({
      prisma,
      operationAlerts,
      productGenerationAlerts,
      agentRunner,
    });

    await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: ['https://example.com/detail-1.jpg'],
      },
      ORGANIZATION_ID,
      USER_ID,
      {
        operationAlert: {
          mode: 'parent',
          batchId: 'batch-1',
          parentOperationKey: 'product-generation:batch-1',
          childKind: 'detail_page',
        },
      },
    );

    expect(operationAlerts.start).not.toHaveBeenCalledWith(
      expect.objectContaining({ operationKey: `detail-page:${GENERATION_ID}` }),
    );
    expect(productGenerationAlerts.recordChildStarted).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'detail_page',
      childId: GENERATION_ID,
    });
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        generationInput: expect.objectContaining({
          productGeneration: {
            mode: 'parent',
            productGenerationBatchId: 'batch-1',
            parentOperationKey: 'product-generation:batch-1',
            childKind: 'detail_page',
          },
        }),
      }),
    }));
  });

  it('routes parent-mode detail enqueue failures to the product generation parent alert', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const productGenerationAlerts = makeProductGenerationAlertsStub();
    const agentRunner = makeAgentRunnerStub({
      ok: false,
      reason: 'queue down',
    } as never);
    const service = makeGenerationService({
      prisma,
      operationAlerts,
      productGenerationAlerts,
      agentRunner,
    });

    await expect(
      service.generate(
        {
          productId: MASTER_ID,
          templateId: 'bold-vertical',
          rawTitle: '휴대용목걸이비눗방울',
          rawCategory: '완구',
          rawDescription: '아이들이 가지고 놀기 좋은 장난감',
          rawOptions: '혼합 색상 / 사이즈 85*60mm',
          imageUrls: ['https://example.com/detail-1.jpg'],
        },
        ORGANIZATION_ID,
        USER_ID,
        {
          operationAlert: {
            mode: 'parent',
            batchId: 'batch-1',
            parentOperationKey: 'product-generation:batch-1',
            childKind: 'detail_page',
          },
        },
      ),
    ).rejects.toThrow('Agent OS enqueue failed: queue down');

    expect(productGenerationAlerts.markChildFinished).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      parentOperationKey: 'product-generation:batch-1',
      childKind: 'detail_page',
      status: 'failed',
      childId: GENERATION_ID,
      errorMessage: 'Agent OS enqueue failed: queue down',
    });
    expect(operationAlerts.fail).not.toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${GENERATION_ID}`,
      expect.anything(),
    );
  });

  it('drains retryable detail-page executor failures so local preview reaches the terminal sink path', async () => {
    const prisma = makePrisma();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const operationAlerts = makeOperationAlertsStub();
    const agentRunner = makeAgentRunnerStub();
    agentRunner.executeRequest = vi.fn().mockResolvedValue({
      executed: true,
      requestId: REQUEST_ID,
      errorCode: 'runtime_error',
    });
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
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: ['https://example.com/detail-1.jpg'],
      },
      ORGANIZATION_ID,
      USER_ID,
    );
    await flushInlineExecutor();

    expect(agentRunner.executeRequest).toHaveBeenCalledTimes(3);
    expect(agentRunner.executeRequest).toHaveBeenNthCalledWith(3, {
      organizationId: ORGANIZATION_ID,
      requestId: REQUEST_ID,
      workerId: 'detail-page-generate-inline',
    });
  });

  it('uses the newest non-image detail-page generation as the base for image-only runs', async () => {
    const prisma = makePrisma();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const operationAlerts = makeOperationAlertsStub();
    const imageOnlyBase = makeGenerationRow({
      id: '77777777-7777-4777-8777-777777777777',
      generationInput: {
        rawTitle: '이전 이미지 생성',
        imageUrls: ['https://example.com/image.jpg'],
        templateId: 'bold-vertical',
        generationMode: 'image',
      },
      generationResult: {
        templateId: 'bold-vertical',
        result: boldVerticalResult(),
        imageUrls: ['https://example.com/image.jpg'],
        processedImages: {},
      },
    });
    const draftBase = makeGenerationRow({
      id: '88888888-8888-4888-8888-888888888888',
      generationInput: {
        rawTitle: '카피 생성 결과',
        imageUrls: ['https://example.com/image.jpg'],
        templateId: 'bold-vertical',
        generationMode: 'draft',
      },
      generationResult: {
        templateId: 'bold-vertical',
        result: boldVerticalResult(),
        imageUrls: ['https://example.com/image.jpg'],
        processedImages: {},
      },
    });
    prisma.contentGeneration.findMany = vi.fn().mockResolvedValue([
      imageOnlyBase,
      draftBase,
    ]);
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
    );

    await service.generate(
      {
        productId: MASTER_ID,
        templateId: 'bold-vertical',
        generationMode: 'image',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상 / 사이즈 85*60mm',
        imageUrls: ['https://example.com/detail-1.jpg'],
        sourceReferences: [
          { sourceType: 'sourcing_candidate', sourceCandidateId: CANDIDATE_ID },
        ],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    );
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationInput: expect.objectContaining({
            generationMode: 'image',
            baseContentGenerationId: draftBase.id,
          }),
        }),
      }),
    );
  });

  it('uses content workspace history as the base for direct image-only runs without product or candidate', async () => {
    const prisma = makePrisma();
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const operationAlerts = makeOperationAlertsStub();
    const contentWorkspaces = {
      ensureForGeneration: vi.fn(async () => ({
        id: REGISTRATION_WORKSPACE_ID,
        displayName: '키즈 텀블러',
        normalizedTitle: '키즈 텀블러',
      })),
    };
    const draftBase = makeGenerationRow({
      id: '88888888-8888-4888-8888-888888888888',
      contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
      sourceCandidateId: null,
      generationInput: {
        rawTitle: '키즈 텀블러',
        imageUrls: ['https://example.com/image.jpg'],
        templateId: 'bold-vertical',
        generationMode: 'draft',
      },
      generationResult: {
        templateId: 'bold-vertical',
        result: boldVerticalResult(),
        imageUrls: ['https://example.com/image.jpg'],
        processedImages: {},
      },
    });
    prisma.contentGeneration.findMany = vi.fn().mockResolvedValue([draftBase]);
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      undefined,
      makeAgentRunnerStub(),
      contentWorkspaces,
    );

    await service.generate(
      {
        templateId: 'bold-vertical',
        generationMode: 'image',
        rawTitle: '키즈 텀블러',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '혼합 색상',
        imageUrls: ['https://example.com/detail-1.jpg'],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(contentWorkspaces.ensureForGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      rawTitle: '키즈 텀블러',
      sourceCandidateId: null,
      targetMasterId: null,
    });
    expect(prisma.contentGeneration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
        }),
      }),
    );
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
          sourceCandidateId: null,
          generationInput: expect.objectContaining({
            generationMode: 'image',
            baseContentGenerationId: draftBase.id,
          }),
        }),
      }),
    );
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
        targetType: 'sourcing_candidate',
        targetId: CANDIDATE_ID,
        href: `/product-pipeline/detail-pages/${GENERATION_ID}/editor?sourceCandidateId=${CANDIDATE_ID}&returnTo=%2Fproduct-pipeline%2Fcollected-products%2F${CANDIDATE_ID}`,
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
        generationResult: expect.objectContaining({
          templateId: 'bold-vertical',
          operationCancellation: expect.objectContaining({
            requestedByUserId: null,
            reason: '사용자 요청으로 생성이 중단되었습니다.',
            result: 'cancelled',
            target: {
              targetType: 'content_generation',
              generationId: GENERATION_ID,
            },
            affected: expect.objectContaining({
              contentGenerationIds: [GENERATION_ID],
            }),
          }),
        }),
      },
    });
    expect(agentRunner.cancelBySource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceType: 'ai.detail_page_generate',
      sourceResourceType: 'content_generation',
      sourceResourceId: GENERATION_ID,
      reason: '사용자 요청으로 생성이 중단되었습니다.',
      actorUserId: null,
    });
    expect(operationAlerts.cancel).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${GENERATION_ID}`,
      expect.objectContaining({
        message: '사용자 요청으로 생성이 중단되었습니다.',
        metadata: expect.objectContaining({ errorCode: 'user_cancelled' }),
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
        targetType: 'content_workspace',
        targetId: REGISTRATION_WORKSPACE_ID,
        href: `/product-pipeline/detail-pages/${GENERATION_ID}/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${REGISTRATION_WORKSPACE_ID}`,
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

  it('product-less generate creates a direct content workspace without a collected candidate', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const contentWorkspaces = {
      ensureForGeneration: vi.fn(async () => ({
        id: REGISTRATION_WORKSPACE_ID,
        displayName: '키즈 텀블러',
        normalizedTitle: '키즈 텀블러',
      })),
    };
    prisma.contentGenerationGroup.findFirst.mockResolvedValueOnce(null);
    prisma.contentGeneration.create.mockResolvedValueOnce({
      ...makeGenerationRow({
        generationGroupId: GENERATION_GROUP_ID,
        contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
        templateId: 'kids-playful',
        generationInput: {
          rawTitle: '  키즈   텀블러  ',
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
        generatedTitle: '  키즈   텀블러  ',
        generationGroup: {
          id: GENERATION_GROUP_ID,
          targetMasterId: null,
        },
      }),
    });
    prisma.contentGeneration.findFirst.mockResolvedValue(makeGenerationRow({
      generationGroupId: GENERATION_GROUP_ID,
      contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
      templateId: 'kids-playful',
      generationInput: {
        rawTitle: '  키즈   텀블러  ',
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
      generatedTitle: '  키즈   텀블러  ',
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
      contentWorkspaces,
    );

    const result = await service.generate(
      {
        rawTitle: '  키즈   텀블러  ',
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
    expect(prisma.sourcingCandidate.findFirst).not.toHaveBeenCalled();
    expect(contentWorkspaces.ensureForGeneration).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      triggeredByUserId: USER_ID,
      rawTitle: '  키즈   텀블러  ',
      sourceCandidateId: null,
      targetMasterId: null,
    });
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        contentType: 'detail_page',
        generationGroupId: GENERATION_GROUP_ID,
        contentWorkspaceId: REGISTRATION_WORKSPACE_ID,
        sourceCandidateId: null,
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
        title: '  키즈   텀블러  ',
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
        reason: `detail_page_generate for content workspace ${REGISTRATION_WORKSPACE_ID}`,
      }),
    );
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        targetType: 'content_workspace',
        targetId: REGISTRATION_WORKSPACE_ID,
        href: `/product-pipeline/detail-pages/${GENERATION_ID}/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${REGISTRATION_WORKSPACE_ID}`,
      }),
    );
    expect(operationAlerts.fail).not.toHaveBeenCalled();
    expect(result.productId).toBeNull();
    expect(result.imageProcessingStatus).toBe('processing');
  });

  it('appends direct generation to the loaded content workspace instead of creating a new one', async () => {
    const prisma = makePrisma();
    prisma.contentWorkspace = {
      findFirst: vi.fn().mockResolvedValue({
        id: LOADED_REGISTRATION_WORKSPACE_ID,
        ownerType: 'sourcing_candidate',
        sourceCandidateId: CANDIDATE_ID,
        targetMasterId: null,
        displayName: 'QA Detail Panel',
        normalizedTitle: 'qadetailpanel',
      }),
    };
    prisma.contentGeneration.create.mockResolvedValueOnce({
      ...makeGenerationRow({
        contentWorkspaceId: LOADED_REGISTRATION_WORKSPACE_ID,
        sourceCandidateId: CANDIDATE_ID,
        generationGroup: {
          id: GENERATION_GROUP_ID,
          targetMasterId: null,
        },
      }),
    });
    prisma.contentGeneration.findFirst.mockResolvedValue(makeGenerationRow({
      contentWorkspaceId: LOADED_REGISTRATION_WORKSPACE_ID,
      sourceCandidateId: CANDIDATE_ID,
      generationGroup: {
        id: GENERATION_GROUP_ID,
        targetMasterId: null,
      },
    }));
    const textCompletion = { complete: vi.fn() };
    const imageStorage = { save: vi.fn() };
    const operationAlerts = makeOperationAlertsStub();
    const contentWorkspaces = {
      ensureForGeneration: vi.fn(async () => ({
        id: REGISTRATION_WORKSPACE_ID,
        displayName: 'New direct workspace',
        normalizedTitle: 'newdirectworkspace',
      })),
    };
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
      undefined,
      makeAgentRunnerStub(),
      undefined,
      contentWorkspaces,
    );

    await service.generate(
      {
        rawTitle: 'QA Detail Panel',
        rawCategory: '완구',
        rawDescription: '기존 이력에 누적되어야 합니다.',
        rawOptions: '',
        imageUrls: ['https://example.com/loaded.jpg'],
        heroImageMode: 'first',
        templateId: 'kids-playful',
        contentWorkspaceId: LOADED_REGISTRATION_WORKSPACE_ID,
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(contentWorkspaces.ensureForGeneration).not.toHaveBeenCalled();
    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contentWorkspaceId: LOADED_REGISTRATION_WORKSPACE_ID,
        sourceCandidateId: CANDIDATE_ID,
      }),
      include: expect.objectContaining({
        generationGroup: expect.any(Object),
      }),
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'content_workspace',
        targetId: LOADED_REGISTRATION_WORKSPACE_ID,
        href: `/product-pipeline/detail-pages/${GENERATION_ID}/editor?returnTo=%2Fproduct-pipeline%2Fregistered-products%2F${LOADED_REGISTRATION_WORKSPACE_ID}`,
      }),
    );
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

  it('normalizes prefill target arrays from the model into a string', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          category: '완구/놀이',
          target: ['부모 구매자', '선물 구매자'],
          features: [
            '아이들이 쉽게 사용할 수 있는 놀이 상품',
            '실내외 활동에 모두 어울리는 구성',
            '선물용으로 설명하기 쉬운 패키지',
          ],
          options: [],
          extraNotes: '',
        }),
      }),
    };
    const service = makeService(
      prisma,
      textCompletion,
      { save: vi.fn() },
      makeOperationAlertsStub(),
    );

    const result = await service.prefill(
      {
        rawTitle: '키즈 놀이 세트',
        imageUrls: [],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(result.target).toBe('부모 구매자, 선물 구매자');
  });
});
