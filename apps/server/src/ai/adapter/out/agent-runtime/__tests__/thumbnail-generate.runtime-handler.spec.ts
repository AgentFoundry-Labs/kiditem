import { describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerateRuntimeHandler } from '../thumbnail-generate.runtime-handler';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import { AgentOsRuntimeError } from '../../../../../agent-os/domain/agent-os.errors';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/agent-runtime.port';
import type { ThumbnailEditorAiService } from '../../../../application/service/thumbnail-editor-ai.service';

const VALID_INPUT_IMAGE = {
  data: 'YmFzZTY0LWRhdGE=',
  mimeType: 'image/png',
  label: 'Product photo',
  url: 'https://cdn.example.com/p1.png',
  storageKey: 'thumbnail-inputs/org/p1.png',
  role: 'product' as const,
  sortOrder: 0,
  source: 'upload',
  fileSize: 12345,
};

function makeCtx(
  overrides: Partial<AgentRuntimeExecutionContext> = {},
): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'inst-1',
    agentType: 'thumbnail_generate',
    requestId: 'req-1',
    runId: 'run-1',
    taskSessionId: 'sess-1',
    taskKey: 'default',
    adapterType: 'claude_local',
    model: 'gemini-image-test',
    promptPath: 'agent-config/prompts/agents/thumbnail-generate.md',
    input: {
      mode: 'edit',
      editCase: 'single',
      purpose: 'compliance',
      productName: 'Cute Tumbler',
      inputs: [VALID_INPUT_IMAGE],
    },
    trustLevel: 0,
    runtimeConfig: {},
    ...overrides,
  };
}

function makeHandler(editorAi: ThumbnailEditorAiService) {
  const registry = new AgentRuntimeHandlerRegistry();
  const handler = new ThumbnailGenerateRuntimeHandler(registry, editorAi);
  return { handler, registry };
}

describe('ThumbnailGenerateRuntimeHandler', () => {
  it('registers itself with the registry on module init', () => {
    const editorAi = {
      generateEdit: vi.fn(),
      generateCreative: vi.fn(),
    } as unknown as ThumbnailEditorAiService;
    const { handler, registry } = makeHandler(editorAi);
    handler.onModuleInit();
    expect(registry.registeredTypes()).toContain('thumbnail_generate');
  });

  it('routes edit mode to ThumbnailEditorAiService.generateEdit and returns candidates', async () => {
    const editorAi = {
      generateEdit: vi.fn().mockResolvedValue([
        {
          url: 'https://cdn.example.com/c1.png',
          storageKey: 'thumbnail-generations/org/c1.png',
          filename: 'edit-1.png',
          mimeType: 'image/png',
          fileSize: 22222,
        },
      ]),
      generateCreative: vi.fn(),
    } as unknown as ThumbnailEditorAiService;
    const { handler } = makeHandler(editorAi);

    const result = await handler.execute(makeCtx());

    expect(editorAi.generateEdit).toHaveBeenCalledTimes(1);
    expect(editorAi.generateCreative).not.toHaveBeenCalled();
    expect(result.provider).toBe('gemini-image');
    expect(result.output).toMatchObject({
      candidates: [
        expect.objectContaining({
          url: 'https://cdn.example.com/c1.png',
          filename: 'edit-1.png',
        }),
      ],
    });
  });

  it('routes creative mode to ThumbnailEditorAiService.generateCreative', async () => {
    const editorAi = {
      generateEdit: vi.fn(),
      generateCreative: vi.fn().mockResolvedValue([
        { url: 'https://cdn.example.com/cr.png', filename: 'creative-1.png' },
      ]),
    } as unknown as ThumbnailEditorAiService;
    const { handler } = makeHandler(editorAi);

    await handler.execute(
      makeCtx({
        input: {
          mode: 'creative',
          productName: 'Cute Tumbler',
          sceneType: 'white-studio',
          styleType: 'minimal',
          inputs: [VALID_INPUT_IMAGE],
        },
      }),
    );

    expect(editorAi.generateCreative).toHaveBeenCalledTimes(1);
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
  });

  it('throws agent_input_invalid when input does not match the schema', async () => {
    const editorAi = {
      generateEdit: vi.fn(),
      generateCreative: vi.fn(),
    } as unknown as ThumbnailEditorAiService;
    const { handler } = makeHandler(editorAi);
    await expect(
      handler.execute(makeCtx({ input: { mode: 'edit', inputs: [] } as unknown as Record<string, unknown> })),
    ).rejects.toMatchObject({ code: 'agent_input_invalid' });
    expect(editorAi.generateEdit).not.toHaveBeenCalled();
  });

  it('throws thumbnail_ai_returned_no_image when editor service returns empty', async () => {
    const editorAi = {
      generateEdit: vi.fn().mockResolvedValue([]),
      generateCreative: vi.fn(),
    } as unknown as ThumbnailEditorAiService;
    const { handler } = makeHandler(editorAi);
    await expect(handler.execute(makeCtx())).rejects.toBeInstanceOf(
      AgentOsRuntimeError,
    );
    await expect(handler.execute(makeCtx())).rejects.toMatchObject({
      code: 'thumbnail_ai_returned_no_image',
    });
  });

  it('throws model_required when ctx.model is empty', async () => {
    const editorAi = {
      generateEdit: vi.fn(),
      generateCreative: vi.fn(),
    } as unknown as ThumbnailEditorAiService;
    const { handler } = makeHandler(editorAi);
    await expect(
      handler.execute(makeCtx({ model: '' })),
    ).rejects.toMatchObject({ code: 'model_required' });
  });
});
