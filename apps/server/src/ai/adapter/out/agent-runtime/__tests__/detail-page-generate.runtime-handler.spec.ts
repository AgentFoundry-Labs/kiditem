import { describe, expect, it, vi } from 'vitest';
import { DetailPageGenerateRuntimeHandler } from '../detail-page-generate.runtime-handler';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentOsRuntimeError } from '../../../../../agent-os/domain/agent-os.errors';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/agent-runtime.port';
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
