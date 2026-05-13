import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ImageEditRuntimeHandler } from '../image-edit.runtime-handler';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/agent-runtime.port';

function makeCtx(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'inst-1',
    agentType: 'image_edit',
    requestId: 'req-1',
    runId: 'run-1',
    taskSessionId: 'sess-1',
    taskKey: 'default',
    adapterType: 'python_http',
    model: 'gemini-3.1-flash-image-preview',
    promptPath: 'agent-config/prompts/agents/manager.md',
    input: {
      image_url: 'data:image/png;base64,AAAA',
      preset: 'custom',
      user_prompt: '노란색 상품 하나 없애줘',
    },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

function makeHandler() {
  const registry = new AgentRuntimeHandlerRegistry();
  const handler = new ImageEditRuntimeHandler(registry);
  return { handler, registry };
}

describe('ImageEditRuntimeHandler', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('PYTHON_AGENTS_BASE_URL', 'http://python-agent.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('registers itself with the registry on module init', () => {
    const { handler, registry } = makeHandler();
    handler.onModuleInit();
    expect(registry.registeredTypes()).toContain('image_edit');
  });

  it('calls the Python image_edit agent and returns validated output', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({
        output: { image_url: 'data:image/png;base64,BBBB' },
      })),
    } as unknown as Response);
    const { handler } = makeHandler();

    const result = await handler.execute(makeCtx());

    expect(global.fetch).toHaveBeenCalledWith(
      'http://python-agent.test/run',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_type: 'image_edit',
          input: {
            image_url: 'data:image/png;base64,AAAA',
            preset: 'custom',
            user_prompt: '노란색 상품 하나 없애줘',
          },
        }),
      }),
    );
    expect(result).toMatchObject({
      output: { image_url: 'data:image/png;base64,BBBB' },
      provider: 'python-http',
    });
  });

  it('rejects invalid input before calling Python', async () => {
    global.fetch = vi.fn();
    const { handler } = makeHandler();

    await expect(
      handler.execute(makeCtx({ input: { preset: 'custom' } })),
    ).rejects.toMatchObject({ code: 'agent_input_invalid' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects Python output without image_url', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(JSON.stringify({ output: { ok: true } })),
    } as unknown as Response);
    const { handler } = makeHandler();

    await expect(handler.execute(makeCtx())).rejects.toMatchObject({
      code: 'agent_output_invalid',
    });
  });

  it('surfaces Python HTTP failures as runtime errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(JSON.stringify({ detail: 'Agent execution failed' })),
    } as unknown as Response);
    const { handler } = makeHandler();

    await expect(handler.execute(makeCtx())).rejects.toMatchObject({
      code: 'python_agent_failed',
      message: 'Agent execution failed',
    });
  });
});
