import { describe, expect, it, vi, afterEach } from 'vitest';
import { ImageEditRuntimeHandler } from '../image-edit.runtime-handler';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/agent-runtime.port';
import type { ImageEditMediaPort } from '../../../../application/port/out/image-edit-media.port';
import type { ImageStoragePort } from '../../../../application/port/out/image-storage.port';

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
    adapterType: 'gemini_image',
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

function makeMedia(overrides: Partial<ImageEditMediaPort> = {}): ImageEditMediaPort {
  return {
    editImage: vi.fn().mockResolvedValue({
      imageUrl: 'https://cdn.example.com/tmp/image-edits/out.png',
      storageKey: 'tmp/image-edits/org-1/out.png',
      mimeType: 'image/png',
      fileSize: 6,
    }),
    ...overrides,
  };
}

function makeStorage(overrides: Partial<ImageStoragePort> = {}): ImageStoragePort {
  return {
    save: vi.fn(),
    copy: vi.fn(),
    delete: vi.fn(),
    extractKey: vi.fn(() => null),
    ...overrides,
  } as unknown as ImageStoragePort;
}

function makeHandler(media = makeMedia(), storage = makeStorage()) {
  const registry = new AgentRuntimeHandlerRegistry();
  const handler = new ImageEditRuntimeHandler(registry, media, storage);
  return { handler, registry, media, storage };
}

describe('ImageEditRuntimeHandler', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllEnvs();
    global.fetch = originalFetch;
  });

  it('registers itself with the registry on module init', () => {
    const { handler, registry } = makeHandler();
    handler.onModuleInit();
    expect(registry.registeredTypes()).toContain('image_edit');
  });

  it('delegates image_edit execution to the Nest media port and returns validated output', async () => {
    global.fetch = vi.fn();
    const { handler, media } = makeHandler();

    const result = await handler.execute(makeCtx());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(media.editImage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      model: 'gemini-3.1-flash-image-preview',
      preset: 'custom',
      imageUrl: 'data:image/png;base64,AAAA',
      imageUrls: undefined,
      userPrompt: '노란색 상품 하나 없애줘',
    });
    expect(result).toMatchObject({
      output: { image_url: 'https://cdn.example.com/tmp/image-edits/out.png' },
      provider: 'gemini-image',
    });
  });

  it('passes color_guide image_urls to the same Nest media port', async () => {
    const { handler, media } = makeHandler();

    await handler.execute(makeCtx({
      input: {
        preset: 'color_guide',
        image_urls: [
          'https://cdn.example.com/red.png',
          'https://cdn.example.com/blue.png',
        ],
      },
    }));

    expect(media.editImage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      model: 'gemini-3.1-flash-image-preview',
      preset: 'color_guide',
      imageUrl: undefined,
      imageUrls: [
        'https://cdn.example.com/red.png',
        'https://cdn.example.com/blue.png',
      ],
      userPrompt: undefined,
    });
  });

  it('rejects invalid input before calling media', async () => {
    global.fetch = vi.fn();
    const { handler } = makeHandler();

    await expect(
      handler.execute(makeCtx({ input: { preset: 'custom' } })),
    ).rejects.toMatchObject({ code: 'agent_input_invalid' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects private HTTP image URLs before calling media', async () => {
    global.fetch = vi.fn();
    const media = makeMedia();
    const { handler } = makeHandler(media);

    await expect(
      handler.execute(makeCtx({
        input: {
          image_url: 'http://127.0.0.1/internal.png',
          preset: 'enhance',
        },
      })),
    ).rejects.toMatchObject({
      code: 'agent_input_invalid',
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(media.editImage).not.toHaveBeenCalled();
  });

  it('allows own-storage localhost image URLs before delegating to the media port', async () => {
    global.fetch = vi.fn();
    const media = makeMedia();
    const storage = makeStorage({
      extractKey: vi.fn((url: string) => (
        url === 'http://localhost:9000/kiditem/tmp/source.png'
          ? 'tmp/source.png'
          : null
      )),
    });
    const { handler } = makeHandler(media, storage);

    await handler.execute(makeCtx({
      input: {
        image_url: 'http://localhost:9000/kiditem/tmp/source.png',
        preset: 'enhance',
      },
    }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(media.editImage).toHaveBeenCalledWith(expect.objectContaining({
      imageUrl: 'http://localhost:9000/kiditem/tmp/source.png',
      preset: 'enhance',
    }));
  });

  it('rejects media output without image_url', async () => {
    const media = makeMedia({
      editImage: vi.fn().mockResolvedValue({
        imageUrl: '',
        storageKey: null,
        mimeType: 'image/png',
        fileSize: 0,
      }),
    });
    const { handler } = makeHandler(media);

    await expect(handler.execute(makeCtx())).rejects.toMatchObject({
      code: 'agent_output_invalid',
    });
  });
});
