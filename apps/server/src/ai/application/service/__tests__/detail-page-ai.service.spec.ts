import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailPageAiService } from '../detail-page-ai.service';
import { DetailPageGenerationService } from '../detail-page-generation.service';
import { DetailPageGeneratedImagesService } from '../detail-page-generated-images.service';
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
  };
}

function makeService(
  prisma: unknown,
  textCompletion: unknown,
  imageStorage: unknown,
  operationAlerts: OperationAlertService,
  heroImageService?: unknown,
  agentRunner: AgentRunnerPort = makeAgentRunnerStub(),
): DetailPageAiService {
  const boldVertical = new BoldVerticalRefinerService(heroImageService as never);
  const kidsPlayful = new KidsPlayfulRefinerService(heroImageService as never);
  const resultRefiner = new DetailPageResultRefinerService(boldVertical, kidsPlayful);
  const generatedImages = new DetailPageGeneratedImagesService(heroImageService as never);
  const query = new DetailPageQueryService(prisma as never, resultRefiner);
  const generation = new DetailPageGenerationService(
    prisma as never,
    textCompletion as never,
    imageStorage as never,
    operationAlerts,
    resultRefiner,
    generatedImages,
    query,
    agentRunner,
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

function kidsPlayfulResult() {
  return {
    section1: {
      subhead: '오감발달 놀이시간',
      mainHeadline: '수제왁스팝',
      heroImageIndex: 1,
    },
    section2: {
      reviews: [
        { usp: '촉감', headline: '손끝이 즐거워요', body: '말랑한 느낌이 좋아요' },
        { usp: '소리', headline: '바삭 소리가나요', body: '누를 때 재미있어요' },
        { usp: '색상', headline: '알록달록해요', body: '색깔 구경도 즐거워요' },
        { usp: '놀이', headline: '혼자도 잘 놀아요', body: '집중해서 만져요' },
      ],
    },
    section3: {
      label: '촉감놀이 200%',
      headline: '손끝 놀이 친구!',
      subhead: '오감으로 즐기는 시간',
      scenarios: [
        { caption: '포장을 열고 왁스팝을 준비하세요', imageIndex: 1 },
        { caption: '손으로 주무르며 모양을 느껴보세요', imageIndex: 0 },
        { caption: '바삭한 소리를 들으며 놀아보세요', imageIndex: 0 },
      ],
    },
    section4: {
      intro: { line1: '놀이가 단조로우라', line2: '금방 지루해지는', line3: '낭패' },
      cards: [
        { title: '같은 장난감은 금방 질려요...', subtitle: '흥미 부족' },
        { title: '딱딱한 놀이는 손이 아파요...', subtitle: '촉감 아쉬움' },
      ],
      moodImageIndex: 1,
    },
    section5: {
      headlineLine1: '손끝으로',
      headlineLine2: '바삭하게 즐겨요',
      subcopy: ['말랑한 촉감 놀이', '바삭한 소리 재미', '알록달록 색상 구성'],
      imageIndex: 1,
    },
    section6: {
      label: '왁스팝 특징',
      headline: '손으로 느끼는 즐거움',
      bigHeadline: '오감발달!',
      cards: [
        { num: '01', title: '말랑촉감', subtitle: '손끝자극', imageIndex: 0 },
        { num: '02', title: '바삭소리', subtitle: '놀이몰입', imageIndex: 1 },
        { num: '03', title: '색상구성', subtitle: '랜덤재미', imageIndex: 2 },
      ],
    },
    section7: {
      tagText: 'KeyPoint',
      headlineLine1: '말랑하게',
      headlineLine2: '손끝자극',
      emphasisInLine2: '자극',
      body1: '누를 때마다 촉감이 살아나고',
      body2: '손끝 감각을 즐겁게 깨워요',
      bodyEmphasis: '오감 놀이에 딱 좋아요',
      imageIndex: 1,
    },
    section8: {
      introLine1: '바삭한 소리와 촉감',
      introLine2: '오감발달 놀이시간',
      introLine3: '수제왁스팝',
      blocks: [
        {
          pillLabel: '01. 바삭소리',
          headline: '누를수록\n재미있어요',
          body: '손으로 누르면 바삭한 소리가 나요',
          imageIndex: 1,
        },
        {
          pillLabel: '02. 색상구성',
          headline: '색마다\n다른 재미',
          body: '랜덤 색상으로 고르는 재미가 있어요',
          imageIndex: 2,
        },
      ],
    },
    section9: {
      tagText: 'KeyPoint',
      smallHeadline: '집에서도 즐거운 놀이',
      bigHeadline: { line1: '가볍게', line2: '즐기는', line3: '촉감' },
      emphasisInLine3: '촉감',
      body: ['가방에 넣기 부담 없고', '꺼내서 바로 즐겨요'],
      topic: '휴대성',
    },
    section10: {
      cards: [
        { smallHeadline: '실내놀이', bigHeadlineLine1: '집에서도', bigHeadlineLine2: 'OK', imageIndex: 1 },
        { smallHeadline: '선물추천', bigHeadlineLine1: '아이들이', bigHeadlineLine2: '좋아해', imageIndex: 2 },
        { smallHeadline: '간편보관', bigHeadlineLine1: '정리까지', bigHeadlineLine2: '깔끔', imageIndex: 0 },
      ],
    },
    section11: {
      galleryImageIndices: [0, 1],
      symbolCard: { icon: 'Sparkles', text: 'TOY' },
      closing: {
        body: ['손끝으로 느끼는 즐거움', '오감 발달을 돕는 놀이'],
        headline: ['지금 바로', '즐겨보세요!'],
      },
    },
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
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    expect(prisma.contentGeneration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        masterId: MASTER_ID,
        triggeredByUserId: USER_ID,
        status: 'PROCESSING',
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
          }),
        }),
      }),
    );

    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        href: `/sourcing/${MASTER_ID}/editor?boldId=${GENERATION_ID}`,
      }),
    );

    expect(result.id).toBe(GENERATION_ID);
    expect(result.imageProcessingStatus).toBe('processing');
    expect(result.productId).toBe(MASTER_ID);
  });

  it('passes 14+ audience guidance into detail-page text prompts', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify(boldVerticalResult()),
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

    await service.generate(
      {
        templateId: 'bold-vertical',
        rawTitle: '학생용 말랑이',
        rawCategory: '완구',
        rawDescription: '중고등학생 취미용 말랑이',
        rawOptions: 'DETAIL 이미지 수: 2개',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/action-closeup.jpg',
          'https://example.com/detail.jpg',
        ],
        ageGroup: 'age-14-plus',
        detailImageCount: '2',
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    const call = textCompletion.complete.mock.calls[0]?.[0] ?? {};
    expect(call.system).toContain('중고등학생·청소년·학생');
    expect(call.user).toContain('사용 연령 기준: 14세 이상 상품');
    expect(call.user).toContain('중고등학생·청소년');
    expect(call.user).toContain('DETAIL 본문 이미지 수: 2개');
  });

  it('keeps explicit package images separate from detail images', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          ...boldVerticalResult(),
          detailImageIndices: [0, 1, 2],
          packageImageIndices: [1],
          packageLabel: '박스 구성',
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

    const result = await service.generate(
      {
        templateId: 'bold-vertical',
        rawTitle: '휴대용목걸이비눗방울',
        rawCategory: '완구',
        rawDescription: '아이들이 가지고 놀기 좋은 장난감',
        rawOptions: '박스/세트 정보: 있음',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/package-box.jpg',
          'https://example.com/detail-closeup.jpg',
        ],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    const parsed = result.result as ReturnType<typeof boldVerticalResult> & {
      packageImageIndices?: number[];
      packageLabel?: string;
    };
    expect(parsed.detailImageIndices).toEqual([0, 2]);
    expect(parsed.packageImageIndices).toEqual([1]);
    expect(parsed.packageLabel).toBe('박스 구성');
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
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      makeOperationAlertsStub(),
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
      USER_ID,
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
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      makeOperationAlertsStub(),
      heroImageService,
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
      USER_ID,
    );

    const parsed = result.result as ReturnType<typeof boldVerticalResult> & {
      packageImageIndices?: number[];
      packageLabel?: string;
    };
    expect(parsed.packageImageIndices).toEqual([]);
    expect(parsed.packageLabel).toBe('');
    expect(heroImageService.inferPackageImagePositions).not.toHaveBeenCalled();
  });

  it('keeps kids playful package images at the bottom and generates contextual replacements', async () => {
    const prisma = makePrisma();
    const textCompletion = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify(kidsPlayfulResult()),
      }),
    };
    const imageStorage = {
      save: vi.fn(),
    };
    const heroImageService = {
      inferPackageImagePositions: vi.fn().mockResolvedValue([1]),
      generateHeroBanner: vi.fn().mockResolvedValue('https://cdn.example.com/generated-hero.png'),
      generateUsageGuideImage: vi.fn()
        .mockResolvedValueOnce('https://cdn.example.com/generated-usage-1.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-usage-2.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-usage-3.png'),
      generateDetailCutImage: vi.fn()
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-1.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-2.png')
        .mockResolvedValueOnce('https://cdn.example.com/generated-detail-3.png'),
    };
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      makeOperationAlertsStub(),
      heroImageService,
    );

    const result = await service.generate(
      {
        templateId: 'kids-playful',
        rawTitle: '바삭바삭 수제왁스팝',
        rawCategory: '완구',
        rawDescription: '손으로 누르는 촉감 놀이 상품',
        rawOptions: '박스/세트 정보: 있음',
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/display-box.jpg',
          'https://example.com/action-closeup.jpg',
        ],
      },
      ORGANIZATION_ID,
      USER_ID,
    );

    const prompt = textCompletion.complete.mock.calls[0]?.[0]?.user ?? '';
    expect(prompt).toContain('하단 전용 패키지/박스 후보 인덱스: 1');
    expect(heroImageService.generateHeroBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrls: [
          'https://example.com/product-main.jpg',
          'https://example.com/action-closeup.jpg',
        ],
      }),
    );

    const parsed = result.result as ReturnType<typeof kidsPlayfulResult>;
    const normalIndices = [
      parsed.section1.heroImageIndex,
      ...parsed.section3.scenarios.map((scenario) => scenario.imageIndex),
      parsed.section4.moodImageIndex,
      parsed.section5.imageIndex,
      ...parsed.section6.cards.map((card) => card.imageIndex),
      parsed.section7.imageIndex,
      ...parsed.section8.blocks.map((block) => block.imageIndex),
      ...parsed.section10.cards.map((card) => card.imageIndex),
    ];
    expect(normalIndices).not.toContain(1);
    expect(parsed.section11.galleryImageIndices[1]).toBe(1);
    expect(result.processedImages).toEqual(
      expect.objectContaining({
        __heroBanner: 'https://cdn.example.com/generated-hero.png',
        __usageGuideImage1: 'https://cdn.example.com/generated-usage-1.png',
        __detailImage1: 'https://cdn.example.com/generated-detail-1.png',
      }),
    );
    expect(heroImageService.generateUsageGuideImage).toHaveBeenCalledTimes(1);
    expect(heroImageService.generateDetailCutImage).toHaveBeenCalledTimes(1);
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
        masterId: MASTER_ID,
        triggeredByUserId: USER_ID,
        status: 'PROCESSING',
      }),
    });
    expect(operationAlerts.start).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        operationKey: `detail-page:${GENERATION_ID}`,
        sourceType: 'content_generation',
        sourceId: GENERATION_ID,
        href: `/sourcing/${MASTER_ID}/editor?kpId=${GENERATION_ID}`,
      }),
    );
    expect(prisma.contentGeneration.updateMany).toHaveBeenCalledWith({
      where: { id: GENERATION_ID, organizationId: ORGANIZATION_ID },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(operationAlerts.fail).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      `detail-page:${GENERATION_ID}`,
      expect.objectContaining({
        metadata: expect.objectContaining({ errorCode: 'agent_enqueue_failed' }),
      }),
    );
    expect(operationAlerts.succeed).not.toHaveBeenCalled();
  });

  it('skips alert lifecycle when productId is omitted (standalone preview)', async () => {
    const prisma = makePrisma();
    const operationAlerts = makeOperationAlertsStub();
    const textCompletion = {
      complete: vi.fn().mockRejectedValueOnce(new Error('gemini-timeout')),
    };
    const imageStorage = { save: vi.fn() };
    const service = makeService(
      prisma,
      textCompletion,
      imageStorage,
      operationAlerts,
    );

    await expect(
      service.generate(
        {
          rawTitle: 'standalone',
          rawCategory: '',
          rawDescription: '',
          rawOptions: '',
          imageUrls: [],
          heroImageMode: 'first',
          templateId: 'kids-playful',
        },
        ORGANIZATION_ID,
        USER_ID,
      ),
    ).rejects.toThrow();

    expect(prisma.contentGeneration.create).not.toHaveBeenCalled();
    expect(operationAlerts.start).not.toHaveBeenCalled();
    expect(operationAlerts.fail).not.toHaveBeenCalled();
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
