import { chromium } from 'playwright';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Sourcing1688KeywordAttentionError,
  Sourcing1688KeywordProviderError,
} from '../../../application/port/out/provider/1688-keyword-search.port';
import { Direct1688KeywordSearchAdapter } from './direct-1688-keyword-search.adapter';

vi.mock('playwright', () => ({
  chromium: {
    connectOverCDP: vi.fn(),
    launchPersistentContext: vi.fn(),
    launch: vi.fn(),
  },
}));

describe('Direct1688KeywordSearchAdapter', () => {
  beforeEach(() => {
    vi.mocked(chromium.connectOverCDP).mockReset();
    vi.mocked(chromium.launchPersistentContext).mockReset();
    vi.mocked(chromium.launch).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails closed before navigation when the CDP endpoint is absent or malformed', async () => {
    const adapter = new Direct1688KeywordSearchAdapter();

    await expect(adapter.openSession()).rejects.toMatchObject({
      code: 'cdp_configuration_invalid',
    });
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'ftp://office.test:9444');
    await expect(adapter.openSession()).rejects.toMatchObject({
      code: 'cdp_configuration_invalid',
    });

    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it.each([
    'http://kiditem-office:9444',
    'https://kiditem-office:9444',
    'ws://kiditem-office:9444/devtools/browser/test',
    'wss://kiditem-office:9444/devtools/browser/test',
  ])('accepts the supported CDP endpoint form %s', async (endpoint) => {
    const fixture = browserFixture();
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', endpoint);

    const session = await new Direct1688KeywordSearchAdapter().openSession();
    await session.close();

    expect(chromium.connectOverCDP).toHaveBeenCalledWith(endpoint, { timeout: 20_000 });
    expect(fixture.browser.newContext).not.toHaveBeenCalled();
    expect(chromium.launchPersistentContext).not.toHaveBeenCalled();
    expect(chromium.launch).not.toHaveBeenCalled();
  });

  it('observes API responses before serial page navigation and reuses one owned page across a batch', async () => {
    const fixture = browserFixture({ emitApiOnGoto: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');

    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const first = await session.searchKeyword({ keyword: '儿童笔袋' });
    const second = await session.searchKeyword({ keyword: '儿童雨伞' });
    await session.close();

    expect(first).toMatchObject([{ offerId: '123456', monthlySales: 88 }]);
    expect(second).toMatchObject([{ offerId: '123456', monthlySales: 88 }]);
    expect(fixture.events).toEqual(['response-listener', 'goto', 'response-listener', 'goto']);
    expect(fixture.context.newPage).toHaveBeenCalledOnce();
    expect(fixture.page.goto.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringContaining('keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B'),
      expect.stringContaining('keywords=%E5%84%BF%E7%AB%A5%E9%9B%A8%E4%BC%9E'),
    ]);
    expect(fixture.unrelatedPage.close).not.toHaveBeenCalled();
    expect(fixture.page.close).toHaveBeenCalledOnce();
    expect(fixture.browser.close).toHaveBeenCalledOnce();
  });

  it('uses authenticated DOM records only when no valid search API response was observed', async () => {
    const fixture = browserFixture();
    fixture.page.evaluate.mockResolvedValue([{
      href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
      title: 'DOM 儿童笔袋',
      priceText: '12.5',
      salesText: '近30天成交 88 笔',
    }]);
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');

    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const items = await session.searchKeyword({ keyword: '儿童笔袋' });
    await session.close();

    expect(items).toMatchObject([{ offerId: '123456', title: 'DOM 儿童笔袋', monthlySales: 88 }]);
    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
  });

  it('deduplicates offers across multiple valid API responses before applying the result cap', async () => {
    const fixture = browserFixture({ emitApiOnGoto: true, duplicateApiOnGoto: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    const items = await session.searchKeyword({ keyword: '儿童笔袋' });
    await session.close();

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ offerId: '123456' });
  });

  it('waits for a valid search API response that arrives after DOM content is loaded', async () => {
    const fixture = browserFixture({ lateApiOnGoto: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const result = session.searchKeyword({ keyword: '儿童笔袋' });

    await waitForDelayedFixture();

    await expect(result).resolves.toMatchObject([{ offerId: '123456', monthlySales: 88 }]);
    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('waits for authenticated DOM cards that render after DOM content is loaded', async () => {
    const fixture = browserFixture({ lateDomOnGoto: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const result = session.searchKeyword({ keyword: '儿童笔袋' });

    await waitForDelayedFixture();

    await expect(result).resolves.toMatchObject([{
      offerId: '123456',
      title: 'delayed DOM 儿童笔袋',
      monthlySales: 88,
    }]);
    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
    await session.close();
  });

  it('closes its owned page after caller abort and does not begin another navigation', async () => {
    const fixture = browserFixture({ blockGoto: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const controller = new AbortController();
    const reason = new Error('operation_cancelled');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const result = session.searchKeyword({ keyword: '儿童笔袋', signal: controller.signal }).catch((error: unknown) => error);

    await vi.waitFor(() => expect(fixture.page.goto).toHaveBeenCalledOnce());
    controller.abort(reason);

    expect(await result).toBe(reason);
    expect(fixture.page.close).toHaveBeenCalledOnce();
    expect(fixture.browser.close).toHaveBeenCalledOnce();
    expect(fixture.page.goto).toHaveBeenCalledOnce();
    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    fixture.resolveGoto?.();
  });

  it('aborts and closes immediately while waiting for delayed search results', async () => {
    const fixture = browserFixture({ blockRenderWait: true });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const controller = new AbortController();
    const reason = new Error('operation_deadline_exceeded');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const result = session.searchKeyword({ keyword: '儿童笔袋', signal: controller.signal })
      .catch((error: unknown) => error);

    await vi.waitFor(() => expect(fixture.page.waitForTimeout).toHaveBeenCalledOnce());
    controller.abort(reason);

    expect(await result).toBe(reason);
    expect(fixture.page.close).toHaveBeenCalledOnce();
    expect(fixture.browser.close).toHaveBeenCalledOnce();
    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    fixture.resolveRenderWait?.();
  });

  it('maps a login or security page to typed operator attention', async () => {
    const fixture = browserFixture({ pageText: '请先登录后再继续搜索' });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toBeInstanceOf(
      Sourcing1688KeywordAttentionError,
    );

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it.each([
    '슬라이더를 드래그하여 인증을 완료하세요',
    '정상 접속을 위해 인증이 필요합니다',
  ])('maps the live Korean security challenge to typed operator attention', async (pageText) => {
    const fixture = browserFixture({ pageText });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordAttentionError',
      reason: 'security_challenge',
    });

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('rejects an untrusted final page before forged DOM offers can be normalized', async () => {
    const fixture = browserFixture({ finalUrl: 'https://evil.example/search' });
    fixture.page.evaluate.mockResolvedValue([{
      href: 'https://detail.1688.com/offer/123456.html',
      title: 'forged offer',
      salesText: '近30天成交 88 笔',
    }]);
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('rejects an untrusted final navigation response before authenticated DOM extraction', async () => {
    const fixture = browserFixture({
      navigationResponseUrl: 'https://evil.example/search',
      finalUrl: 'https://s.1688.com/selloffer/offer_search.htm',
    });
    fixture.page.evaluate.mockResolvedValue([{
      href: 'https://detail.1688.com/offer/123456.html',
      title: 'forged redirect offer',
      salesText: '近30天成交 88 笔',
    }]);
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('accepts an allowed HTTPS 1688 final page before extracting authenticated DOM offers', async () => {
    const fixture = browserFixture({
      finalUrl: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
      navigationResponseUrl: 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
    });
    fixture.page.evaluate.mockResolvedValue([{
      href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
      title: 'allowed offer',
      salesText: '近30天成交 88 笔',
    }]);
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).resolves.toMatchObject([{
      offerId: '123456',
      title: 'allowed offer',
    }]);

    await session.close();
  });

  it('ignores a response body from an untrusted response URL and uses the authenticated DOM fallback', async () => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      apiResponseUrl: 'http://s.1688.com/selloffer/search-api',
    });
    fixture.page.evaluate.mockResolvedValue([{
      href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
      title: 'trusted DOM offer',
      salesText: '近30天成交 88 笔',
    }]);
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).resolves.toMatchObject([{
      offerId: '123456',
      title: 'trusted DOM offer',
    }]);

    await session.close();
  });

  it('detects a known trusted 1688 security route without depending on page text', async () => {
    const fixture = browserFixture({ finalUrl: 'https://s.1688.com/punish/verify.htm' });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordAttentionError',
      reason: 'security_challenge',
    });

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('returns a bounded unavailable error without exposing endpoint credentials', async () => {
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://operator:secret@kiditem-office:9444');
    const adapter = new Direct1688KeywordSearchAdapter();

    await expect(adapter.openSession()).rejects.toBeInstanceOf(Sourcing1688KeywordProviderError);
    await expect(adapter.openSession()).rejects.not.toThrow(/operator|secret|kiditem-office/iu);
    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
  });

  it('maps an unreachable CDP endpoint to a bounded error without leaking its address', async () => {
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'wss://kiditem-office:9444/devtools/browser/private');
    vi.mocked(chromium.connectOverCDP).mockRejectedValue(new Error(
      'connect ECONNREFUSED wss://kiditem-office:9444/devtools/browser/private',
    ));

    await expect(new Direct1688KeywordSearchAdapter().openSession()).rejects.toMatchObject({
      code: 'cdp_unavailable',
    });
    await expect(new Direct1688KeywordSearchAdapter().openSession()).rejects.not.toThrow(
      /kiditem-office|private|ECONNREFUSED/iu,
    );
  });
});

function browserFixture(input?: {
  emitApiOnGoto?: boolean;
  duplicateApiOnGoto?: boolean;
  lateApiOnGoto?: boolean;
  lateDomOnGoto?: boolean;
  blockRenderWait?: boolean;
  blockGoto?: boolean;
  pageText?: string;
  finalUrl?: string;
  apiResponseUrl?: string;
  navigationResponseUrl?: string;
}) {
  const events: string[] = [];
  let responseListener: ((response: unknown) => void) | undefined;
  let resolveGoto: (() => void) | undefined;
  let resolveRenderWait: (() => void) | undefined;
  let domRecords: unknown[] = [];
  const page = {
    on: vi.fn((event: string, listener: (response: unknown) => void) => {
      if (event === 'response') {
        events.push('response-listener');
        responseListener = listener;
      }
      return page;
    }),
    off: vi.fn((event: string, listener: unknown) => {
      if (event === 'response' && responseListener === listener) responseListener = undefined;
    }),
    goto: vi.fn(() => {
      events.push('goto');
      const response = {
        url: () => input?.apiResponseUrl ?? 'https://s.1688.com/selloffer/search-api',
        headers: () => ({ 'content-type': 'application/json' }),
        json: async () => ({ offers: [{
          offerId: '123456',
          title: 'API 儿童笔袋',
          offerUrl: 'https://detail.1688.com/offer/123456.html',
          tradeText: '近30天成交 88 笔',
        }] }),
      };
      if (input?.emitApiOnGoto) {
        responseListener?.(response);
        if (input.duplicateApiOnGoto) responseListener?.(response);
      }
      if (input?.lateApiOnGoto) setTimeout(() => responseListener?.(response), 5);
      if (input?.lateDomOnGoto) {
        setTimeout(() => {
          domRecords = [{
            href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
            title: 'delayed DOM 儿童笔袋',
            salesText: '近30天成交 88 笔',
          }];
        }, 5);
      }
      if (input?.blockGoto) return new Promise<void>((resolve) => { resolveGoto = resolve; });
      return Promise.resolve(input?.navigationResponseUrl
        ? { url: () => input.navigationResponseUrl }
        : null);
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn(() => input?.blockRenderWait
      ? new Promise<void>((resolve) => { resolveRenderWait = resolve; })
      : new Promise<void>((resolve) => setTimeout(resolve, 20))),
    evaluate: vi.fn(() => Promise.resolve(domRecords)),
    locator: vi.fn(() => ({ innerText: vi.fn().mockResolvedValue(input?.pageText ?? '') })),
    url: vi.fn(() => input?.finalUrl ?? 'https://s.1688.com/selloffer/offer_search.htm'),
    title: vi.fn().mockResolvedValue('1688 搜索'),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const unrelatedPage = { close: vi.fn() };
  const context = { newPage: vi.fn().mockResolvedValue(page), pages: () => [unrelatedPage, page] };
  const browser = {
    contexts: () => [context],
    newContext: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { browser, context, events, page, resolveGoto, resolveRenderWait, unrelatedPage };
}

function waitForDelayedFixture(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}
