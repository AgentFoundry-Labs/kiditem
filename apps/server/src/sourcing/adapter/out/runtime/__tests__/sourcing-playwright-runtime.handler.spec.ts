import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import { AgentRuntimeHandlerRegistry } from '../../../../../agent-os/application/service/agent-runtime-handler-registry.service';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import {
  SourcingPlaywrightRuntimeHandler,
  detectSourcingPlatform,
  normalizeScrapedData,
  resolveSourcingPlaywrightUserDataDir,
} from '../sourcing-playwright-runtime.handler';

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
    executablePath: vi.fn(() => '/tmp/chromium'),
  },
}));

function context(overrides: Partial<AgentRuntimeExecutionContext> = {}): AgentRuntimeExecutionContext {
  return {
    organizationId: 'org-1',
    agentInstanceId: 'agent-1',
    agentType: 'sourcing',
    requestId: 'request-1',
    runId: 'run-1',
    taskSessionId: 'session-1',
    taskKey: 'default',
    adapterType: 'playwright',
    model: 'tool-wrapper',
    modelPlan: { primary: 'tool-wrapper' },
    promptPath: 'apps/server/src/agent-os/prompts/sourcing.md',
    input: {
      action: 'scrape_url',
      url: 'https://detail.1688.com/offer/1.html',
      organization_id: 'org-1',
    },
    trustLevel: 0,
    runtimeConfig: { playwrightUserDataDir: '/tmp/kiditem-sourcing-profile' },
    ...overrides,
  };
}

describe('SourcingPlaywrightRuntimeHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers itself as the sourcing runtime handler on module init', () => {
    const registry = new AgentRuntimeHandlerRegistry();
    const handler = new SourcingPlaywrightRuntimeHandler(registry);

    handler.onModuleInit();

    expect(registry.resolve('sourcing')).toBe(handler);
  });

  it('executes sourcing scrape_url by launching Playwright with the prepared profile and extension extractors', async () => {
    const evaluate = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        title: '아동용 스니커즈',
        images: ['https://img.example/item.jpg'],
        price_min: 12.5,
      });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue({ jsonValue: vi.fn().mockResolvedValue('context') }),
      evaluate,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue({
      pages: () => [page],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    const handler = new SourcingPlaywrightRuntimeHandler(new AgentRuntimeHandlerRegistry());

    const result = await handler.execute(context());

    expect(chromium.launchPersistentContext).toHaveBeenCalledWith(
      '/tmp/kiditem-sourcing-profile',
      expect.objectContaining({
        executablePath: '/tmp/chromium',
        viewport: { width: 1920, height: 1080 },
      }),
    );
    expect(page.goto).toHaveBeenCalledWith(
      'https://detail.1688.com/offer/1.html',
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(evaluate).toHaveBeenCalledWith(expect.stringContaining('ProductScraper.common'));
    expect(evaluate).toHaveBeenCalledWith(expect.stringContaining('ProductScraper.alibaba1688'));
    expect(result).toEqual(expect.objectContaining({
      provider: 'ts-playwright',
      output: {
        ok: true,
        source_url: 'https://detail.1688.com/offer/1.html',
        platform: '1688',
        scraped_data: expect.objectContaining({
          source_url: 'https://detail.1688.com/offer/1.html',
          source_platform: '1688',
          title: '아동용 스니커즈',
          images: ['https://img.example/item.jpg'],
        }),
      },
    }));
  });

  it('returns failed output without creating an Agent OS runtime exception when extraction returns no data', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockRejectedValue(new Error('timeout')),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(null),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue({
      pages: () => [page],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    const handler = new SourcingPlaywrightRuntimeHandler(new AgentRuntimeHandlerRegistry());

    await expect(handler.execute(context())).resolves.toMatchObject({
      output: {
        ok: false,
        source_url: 'https://detail.1688.com/offer/1.html',
        platform: '1688',
      },
    });
  });
});

describe('sourcing Playwright runtime helpers', () => {
  it('detects 1688 and Alibaba URLs only', () => {
    expect(detectSourcingPlatform('https://detail.1688.com/offer/1.html')).toBe('1688');
    expect(detectSourcingPlatform('https://www.alibaba.com/product-detail/item.html')).toBe('ALIBABA');
    expect(detectSourcingPlatform('https://example.com/item.html')).toBeNull();
    expect(detectSourcingPlatform('https://not1688.com/offer/1.html')).toBeNull();
    expect(detectSourcingPlatform('https://evil.example/item?q=alibaba.com')).toBeNull();
    expect(detectSourcingPlatform('http://127.0.0.1:3000/?next=1688.com')).toBeNull();
  });

  it('normalizes extension extractor output for the finalized bridge', () => {
    expect(
      normalizeScrapedData('https://detail.1688.com/offer/1.html', '1688', {
        title: '아동용 스니커즈',
        images: ['https://img.example/item.jpg'],
        _detail_url: 'https://detail.1688.com/detail.html',
        _extraction_method: 'model',
      }),
    ).toEqual({
      source_url: 'https://detail.1688.com/offer/1.html',
      source_platform: '1688',
      page_type: 'detail',
      title: '아동용 스니커즈',
      images: ['https://img.example/item.jpg'],
    });
  });

  it('uses runtime profile before env profile before local default profile', () => {
    const previous = process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR;
    process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR = '/tmp/env-profile';
    try {
      expect(resolveSourcingPlaywrightUserDataDir({ playwrightUserDataDir: '/tmp/config-profile' })).toBe('/tmp/config-profile');
      expect(resolveSourcingPlaywrightUserDataDir({})).toBe('/tmp/env-profile');
    } finally {
      if (previous === undefined) delete process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR;
      else process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR = previous;
    }
  });
}
);
