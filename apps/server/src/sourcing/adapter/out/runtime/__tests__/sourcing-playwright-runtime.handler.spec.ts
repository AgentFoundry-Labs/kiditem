import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import {
  SourcingPlaywrightRuntimeHandler,
  detectSourcingPlatform,
  normalizeScrapedData,
} from '../sourcing-playwright-runtime.handler';

vi.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: vi.fn(),
    connectOverCDP: vi.fn(),
    executablePath: vi.fn(() => '/tmp/chromium'),
  },
}));

describe('SourcingPlaywrightRuntimeHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects non-HTTPS supplier URLs without launching a browser', async () => {
    const handler = new SourcingPlaywrightRuntimeHandler();

    await expect(handler.scrapeProductUrl({
      sourceUrl: 'http://detail.1688.com/offer/1.html',
    })).resolves.toMatchObject({ ok: false, platform: null });
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
  });

  it('extracts through its owner method without AgentRun context', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue({ jsonValue: vi.fn().mockResolvedValue('context') }),
      evaluate: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ model: { offerDetail: { offerId: 1, subject: '아동용 스니커즈', imageList: [] } } }),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(chromium.launchPersistentContext).mockResolvedValue({
      pages: () => [page], newPage: vi.fn(), close: vi.fn().mockResolvedValue(undefined),
    } as never);
    const handler = new SourcingPlaywrightRuntimeHandler();

    await expect(handler.scrapeProductUrl({
      sourceUrl: 'https://detail.1688.com/offer/1.html',
      runtimeConfig: { playwrightUserDataDir: '/tmp/kiditem-sourcing-profile' },
    })).resolves.toMatchObject({
      ok: true,
      source_url: 'https://detail.1688.com/offer/1.html',
      scraped_data: expect.objectContaining({ title: '아동용 스니커즈' }),
    });
  });
});

describe('sourcing Playwright helpers', () => {
  it('recognizes only supported supplier URLs', () => {
    expect(detectSourcingPlatform('https://detail.1688.com/offer/1.html')).toBe('1688');
    expect(detectSourcingPlatform('https://www.alibaba.com/product-detail/item.html')).toBe('ALIBABA');
    expect(detectSourcingPlatform('https://example.com/item.html')).toBeNull();
  });

  it('normalizes deterministic extractor data', () => {
    expect(normalizeScrapedData('https://detail.1688.com/offer/1.html', '1688', {
      title: '아동용 스니커즈', images: ['https://img.example/item.jpg'],
    })).toMatchObject({ source_platform: '1688', title: '아동용 스니커즈' });
  });
});
