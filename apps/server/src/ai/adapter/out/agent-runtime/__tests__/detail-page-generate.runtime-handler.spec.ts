import { describe, expect, it, vi } from 'vitest';
import { DetailPageGenerateRuntimeHandler } from '../detail-page-generate.runtime-handler';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentOsRuntimeError } from '../../../../../agent-os/domain/agent-os.errors';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/agent-runtime.port';
import { DetailPageGenerateAgentOutputSchema } from '../../../../domain/agent-output';
import { DetailPageResultRefinerService } from '../../../../application/service/detail-page-result-refiner.service';
import type { TextCompletionPort } from '../../../../application/port/out/text-completion.port';

function makeCtx(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'inst-1',
    agentType: 'detail_page_generate',
    requestId: 'req-1',
    runId: 'run-1',
    taskSessionId: 'sess-1',
    taskKey: 'default',
    adapterType: 'claude_local',
    model: 'gemini-test',
    promptPath: 'agent-config/prompts/agents/detail-page-generate.md',
    input: {
      templateId: 'bold-vertical',
      raw: {
        rawTitle: '키즈 텀블러',
        rawCategory: '유아용품',
        rawDescription: '아이가 사용하기 좋은 텀블러',
        rawOptions: '핑크/블루',
        imageUrls: ['https://example.com/p1.jpg'],
      },
      heroImageMode: 'first',
    },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

const VALID_BOLD_VERTICAL_TEXT = JSON.stringify({
  hook: {
    subtext: '이달의 추천',
    text: '키즈 텀블러',
    titleSub: '안심 음수',
    description: '아이가 들기 쉬운 휴대 텀블러',
    imageIndex: 0,
    bannerImageIndex: null,
  },
  section: {
    name: '키즈 텀블러',
    title: '안심 음수',
    subtitle: '안전한 음수 휴대',
  },
  keyPoints: [
    { title: '가벼움', description: '들고 다녀도 부담 없음', imageIndex: 0 },
    { title: '논슬립', description: '미끄러짐 방지 그립', imageIndex: 0 },
    { title: '안심 재질', description: 'KC 인증 안심 재질', imageIndex: 0 },
  ],
  size: { subtitle: '500ml 표준 사이즈', imageIndices: [] },
  color: { subtitle: '핑크/블루 2색', imageIndices: [] },
  usage: { subtitle: '뚜껑을 돌려 음수', imageIndices: [] },
  detailImageIndices: [0],
  productInfo: [
    { key: '제품명', value: '키즈 텀블러' },
    { key: '재질', value: '트라이탄' },
    { key: '색상', value: '핑크/블루' },
  ],
});

const VALID_KIDS_PLAYFUL_TEXT = JSON.stringify({
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
});

function makeHandler(textCompletion: TextCompletionPort) {
  const registry = new AgentRuntimeHandlerRegistry();
  // Real refiner without heroImageService — bold vertical color/package
  // refinement gracefully no-ops when heroImageService is absent.
  const refiner = new DetailPageResultRefinerService(undefined);
  const handler = new DetailPageGenerateRuntimeHandler(
    registry,
    textCompletion,
    refiner,
  );
  return { handler, registry };
}

describe('DetailPageGenerateRuntimeHandler', () => {
  it('registers itself with the registry on module init', () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn(),
    };
    const { handler, registry } = makeHandler(textCompletion);
    handler.onModuleInit();
    expect(registry.registeredTypes()).toContain('detail_page_generate');
  });

  it('parses input, calls TEXT_COMPLETION_PORT, and returns a schema-shaped output', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn().mockResolvedValue({ text: VALID_BOLD_VERTICAL_TEXT }),
    };
    const { handler } = makeHandler(textCompletion);

    const result = await handler.execute(makeCtx());
    expect(textCompletion.complete).toHaveBeenCalledTimes(1);
    expect(textCompletion.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-test',
        responseMimeType: 'application/json',
      }),
    );
    expect(result.output).toMatchObject({
      templateId: 'bold-vertical',
      imageUrls: ['https://example.com/p1.jpg'],
    });
    expect(result.provider).toBe('gemini-text');
    // Bold-vertical refiner splits the rawTitle into hook.text +
    // hook.titleSub (with a trailing "!" on the second line) — assert the
    // text+titleSub pair instead of the original raw title to confirm the
    // refinement runs inside the handler.
    const hook = (result.output as { result: { hook: { text: string; titleSub: string } } })
      .result.hook;
    expect(hook.text).toBe('키즈');
    expect(hook.titleSub).toBe('텀블러!');
  });

  it('passes audience, detail image count, usage-section, and KC payload into the prompt', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn().mockResolvedValue({ text: VALID_BOLD_VERTICAL_TEXT }),
    };
    const { handler } = makeHandler(textCompletion);

    await handler.execute(makeCtx({
      input: {
        templateId: 'bold-vertical',
        raw: {
          rawTitle: '학생용 말랑이',
          rawCategory: '완구',
          rawDescription: '중고등학생 취미용 말랑이',
          rawOptions: '옵션 없음',
          imageUrls: ['https://example.com/product.jpg'],
          ageGroup: 'age-14-plus',
          detailImageCount: '6',
          usageSectionMode: 'exclude',
          kcCertificationStatus: 'exists',
          kcCertificationNumber: 'CB061R1234-1001',
        },
        heroImageMode: 'llm-pick',
      },
    }));

    const call = textCompletion.complete.mock.calls[0]?.[0];
    expect(call?.user).toContain('사용 연령 기준: 14세 이상 상품');
    expect(call?.user).toContain('중고등학생·청소년');
    expect(call?.user).toContain('DETAIL 본문 이미지 수: 6개');
    expect(call?.user).toContain('사용법 영역: 만들지 않음');
    expect(call?.user).toContain('KC 인증번호: CB061R1234-1001');
  });

  it('returns kids-playful package and safety-label exclusions for the sink', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn().mockResolvedValue({ text: VALID_KIDS_PLAYFUL_TEXT }),
    };
    const { handler } = makeHandler(textCompletion);

    const result = await handler.execute(makeCtx({
      input: {
        templateId: 'kids-playful',
        raw: {
          rawTitle: '수제 왁스팝',
          rawCategory: '완구',
          rawDescription: '손으로 누르는 오감 놀이',
          rawOptions: '랜덤 색상',
          imageUrls: [
            'https://example.com/product.jpg',
            'https://example.com/package.jpg',
            'https://example.com/safety.jpg',
          ],
          usageSectionMode: 'exclude',
        },
        heroImageMode: 'llm-pick',
        reservedPackageImageIndices: [1],
        safetyLabelImageIndices: [2],
      },
    }));

    expect(result.output).toMatchObject({
      templateId: 'kids-playful',
      reservedPackageImageIndices: [1],
      safetyLabelImageIndices: [2],
      result: {
        usageEnabled: false,
      },
    });
    expect(textCompletion.complete.mock.calls[0]?.[0]?.user).toContain('사용법 영역: 만들지 않음');
  });

  it('returns bridge-accepted bold-vertical output after safety-label productInfo suppression', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn().mockResolvedValue({ text: VALID_BOLD_VERTICAL_TEXT }),
    };
    const { handler } = makeHandler(textCompletion);

    const result = await handler.execute(makeCtx({
      input: {
        templateId: 'bold-vertical',
        raw: {
          rawTitle: '키즈 텀블러',
          rawCategory: '유아용품',
          rawDescription: '아이가 사용하기 좋은 텀블러',
          rawOptions: '핑크/블루',
          imageUrls: [
            'https://example.com/product.jpg',
            'https://example.com/detail-page-inputs/org/safety-label-kc.jpg',
          ],
        },
        heroImageMode: 'first',
      },
    }));

    const parsed = DetailPageGenerateAgentOutputSchema.safeParse(result.output);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.templateId).toBe('bold-vertical');
    expect(parsed.data?.result.productInfo).toEqual([]);
  });

  it('throws agent_input_invalid when ctx.input does not match the schema', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn(),
    };
    const { handler } = makeHandler(textCompletion);
    await expect(
      handler.execute(makeCtx({ input: { templateId: 'unknown' } as unknown as Record<string, unknown> })),
    ).rejects.toBeInstanceOf(AgentOsRuntimeError);
    await expect(
      handler.execute(makeCtx({ input: { templateId: 'unknown' } as unknown as Record<string, unknown> })),
    ).rejects.toMatchObject({ code: 'agent_input_invalid' });
    expect(textCompletion.complete).not.toHaveBeenCalled();
  });

  it('throws model_required when ctx.model is missing', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn(),
    };
    const { handler } = makeHandler(textCompletion);
    await expect(
      handler.execute(makeCtx({ model: '' })),
    ).rejects.toMatchObject({ code: 'model_required' });
    expect(textCompletion.complete).not.toHaveBeenCalled();
  });

  it('propagates Zod parse failure when Gemini response is malformed', async () => {
    const textCompletion: TextCompletionPort = {
      complete: vi.fn().mockResolvedValue({
        text: JSON.stringify({ totally: 'wrong shape' }),
      }),
    };
    const { handler } = makeHandler(textCompletion);
    await expect(handler.execute(makeCtx())).rejects.toThrow();
  });
});
