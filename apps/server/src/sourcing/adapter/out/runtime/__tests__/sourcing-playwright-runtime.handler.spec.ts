import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import type { AgentRuntimeExecutionContext } from '../../../../../agent-os/application/port/out/runtime/agent-runtime.port';
import {
  SourcingPlaywrightRuntimeHandler,
  detectSourcingPlatform,
  normalizeScrapedData,
  resolveSourcingPlaywrightCdpEndpoint,
  resolveSourcingPlaywrightUserDataDir,
} from '../sourcing-playwright-runtime.handler';

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
    connectOverCDP: vi.fn(),
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
    vi.unstubAllGlobals();
  });

  it('executes sourcing scrape_url with the Sourcing-owned 1688 model extractor before legacy product-scraper scripts', async () => {
    const evaluate = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        model: {
          offerDetail: {
            offerId: 1,
            subject: '아동용 스니커즈',
            imageList: [{ fullPathImageURI: 'https://img.example/item.jpg' }],
          },
          tradeModel: {
            minPrice: '12.50',
            maxPrice: '13.00',
            beginAmount: 2,
            unit: '개',
          },
          sellerModel: {
            companyName: '테스트 공급사',
          },
        },
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
    const handler = new SourcingPlaywrightRuntimeHandler();

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
    expect(evaluate).toHaveBeenCalledWith(expect.stringContaining('globalData.model'));
    expect(evaluate).not.toHaveBeenCalledWith(expect.stringContaining('ProductScraper.common'));
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
          price_min: 12.5,
          price_max: 13,
          moq: 2,
          unit: '개',
          supplier_name: '테스트 공급사',
        }),
      },
    }));
  });

  it('attaches to a configured managed CDP browser before launching a new Playwright profile', async () => {
    vi.mocked(chromium.launchPersistentContext).mockClear();
    vi.mocked(chromium.connectOverCDP).mockClear();
    const evaluate = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        model: {
          offerDetail: {
            offerId: 1,
            subject: '관리 브라우저 상품',
            imageList: [{ fullPathImageURI: 'https://img.example/cdp.jpg' }],
          },
          tradeModel: { minPrice: '20.00' },
          sellerModel: { companyName: '로그인 공급사' },
        },
      });
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue({ jsonValue: vi.fn().mockResolvedValue('context') }),
      evaluate,
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      setViewportSize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const browser = {
      contexts: () => [{
        newPage: vi.fn().mockResolvedValue(page),
      }],
      newContext: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as never);
    const handler = new SourcingPlaywrightRuntimeHandler();

    const result = await handler.execute(context({
      runtimeConfig: { playwrightCdpEndpoint: 'http://127.0.0.1:9222' },
    }));

    expect(chromium.connectOverCDP).toHaveBeenCalledWith(
      'http://127.0.0.1:9222',
      { timeout: 20_000 },
    );
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(page.setViewportSize).toHaveBeenCalledWith({ width: 1920, height: 1080 });
    expect(page.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
    expect(result).toMatchObject({
      output: {
        ok: true,
        scraped_data: {
          title: '관리 브라우저 상품',
          source_platform: '1688',
          price_min: 20,
          supplier_name: '로그인 공급사',
        },
      },
    });
  });

  it('returns failed output without creating an Agent OS runtime exception when extraction returns no data', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockRejectedValue(new Error('timeout')),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(null)
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
    const handler = new SourcingPlaywrightRuntimeHandler();

    await expect(handler.execute(context())).resolves.toMatchObject({
      output: {
        ok: false,
        source_url: 'https://detail.1688.com/offer/1.html',
        platform: '1688',
        requiresRecovery: true,
        recommendedSkillKey: 'sourcing.magic_scraper',
      },
    });
  });

  it('marks redirected 1688 captcha pages as recovery-required anti-bot failures', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockRejectedValue(new Error('timeout')),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(null),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      url: vi.fn(() => 'https://detail.1688.com/_____tmd_____/punish?x5secdata=blocked'),
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue({
      pages: () => [page],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    const handler = new SourcingPlaywrightRuntimeHandler();

    await expect(handler.execute(context())).resolves.toMatchObject({
      output: {
        ok: false,
        source_url: 'https://detail.1688.com/offer/1.html',
        platform: '1688',
        requiresRecovery: true,
        recommendedSkillKey: 'sourcing.magic_scraper',
        recoveryReason: '1688 captcha or anti-bot page detected',
      },
    });
  });

  it('returns recovery metadata when the page navigates during extractor injection', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockRejectedValue(new Error('timeout')),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Execution context was destroyed, most likely because of a navigation')),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue({
      pages: () => [page],
      newPage: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    const handler = new SourcingPlaywrightRuntimeHandler();

    await expect(handler.execute(context())).resolves.toMatchObject({
      output: {
        ok: false,
        source_url: 'https://detail.1688.com/offer/1.html',
        platform: '1688',
        requiresRecovery: true,
        recommendedSkillKey: 'sourcing.magic_scraper',
        recoveryReason: 'Execution context was destroyed, most likely because of a navigation',
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

  it('normalizes product-scraper output for the finalized bridge', () => {
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

  it('uses runtime CDP endpoint before env endpoint and otherwise returns null', () => {
    const previous = process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT;
    process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
    try {
      expect(resolveSourcingPlaywrightCdpEndpoint({
        playwrightCdpEndpoint: 'http://127.0.0.1:9333',
      })).toBe('http://127.0.0.1:9333');
      expect(resolveSourcingPlaywrightCdpEndpoint({})).toBe('http://127.0.0.1:9222');
    } finally {
      if (previous === undefined) delete process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT;
      else process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT = previous;
    }
    expect(resolveSourcingPlaywrightCdpEndpoint({})).toBeNull();
  });

});
