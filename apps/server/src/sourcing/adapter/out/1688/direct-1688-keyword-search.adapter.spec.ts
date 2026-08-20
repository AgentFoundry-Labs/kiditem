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

let testMonotonicNow = 0;

describe('Direct1688KeywordSearchAdapter', () => {
  beforeEach(() => {
    testMonotonicNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => testMonotonicNow);
    vi.mocked(chromium.connectOverCDP).mockReset();
    vi.mocked(chromium.launchPersistentContext).mockReset();
    vi.mocked(chromium.launch).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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

  it('installs response observation before serial navigation and reuses one owned page across a DOM-backed batch', async () => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      domReadiness: readyDomItems('DOM-backed batch offer'),
    });
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

  it('uses authenticated DOM records as the only terminal extraction evidence', async () => {
    const fixture = browserFixture();
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
        title: 'DOM 儿童笔袋',
        priceText: '12.5',
        salesText: '近30天成交 88 笔',
      }],
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');

    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const items = await session.searchKeyword({ keyword: '儿童笔袋' });
    await session.close();

    expect(items).toMatchObject([{ offerId: '123456', title: 'DOM 儿童笔袋', monthlySales: 88 }]);
    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
  });

  it('does not let duplicate unproven API responses replace authenticated DOM records', async () => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      duplicateApiOnGoto: true,
      domReadiness: readyDomItems('DOM survives duplicate response events'),
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    const items = await session.searchKeyword({ keyword: '儿童笔袋' });
    await session.close();

    expect(items).toMatchObject([{ title: 'DOM survives duplicate response events' }]);
    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
  });

  it('does not accept an unproven search API response that arrives after DOM content is loaded', async () => {
    const fixture = browserFixture({ lateApiOnGoto: true, domReadiness: { kind: 'loading' } });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    const result = session.searchKeyword({ keyword: '儿童笔袋' });

    await waitForDelayedFixture();

    await expect(result).rejects.toMatchObject({ code: 'search_extraction_failed' });
    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
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
    expect(fixture.page.evaluate).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('fails closed when trusted search DOM remains in a loading skeleton state', async () => {
    const fixture = browserFixture({ domReadiness: { kind: 'loading' } });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
    expect(fixture.page.close).toHaveBeenCalledOnce();
  });

  it('waits for a loading DOM state to become authenticated item records', async () => {
    const fixture = browserFixture({
      domReadiness: { kind: 'loading' },
      nextDomReadiness: {
        kind: 'items',
        records: [{
          href: 'https://detail.1688.com/offer/123456.html',
          title: 'ready DOM 儿童笔袋',
          salesText: '近30天成交 88 笔',
        }],
      },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).resolves.toMatchObject([{
      offerId: '123456',
      title: 'ready DOM 儿童笔袋',
    }]);

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('waits for a loading DOM state to become a trusted explicit empty result', async () => {
    const fixture = browserFixture({
      domReadiness: { kind: 'loading' },
      nextDomReadiness: { kind: 'explicit_zero' },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).resolves.toEqual([]);

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('does not accept a generic API zero without trusted DOM empty-state evidence', async () => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      apiPayload: { data: { offers: [] } },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
    expect(fixture.apiResponse.json).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'category zero collection',
      url: 'https://s.1688.com/search/category?category=stationery',
      payload: { products: [] },
    },
    {
      name: 'mismatched-keyword offer payload',
      url: 'https://s.1688.com/selloffer/search-api?keywords=%E5%84%BF%E7%AB%A5%E9%9B%A8%E4%BC%9E',
      payload: { offers: [apiOffer('mismatched keyword offer')] },
    },
    {
      name: 'ancillary nonempty category payload',
      url: 'https://s.1688.com/search/category?category=stationery',
      payload: { products: [apiOffer('ancillary offer')] },
    },
  ])('does not authorize $name while trusted DOM remains loading', async ({ url, payload }) => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      apiResponseUrl: url,
      apiPayload: payload,
      domReadiness: { kind: 'loading' },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
  });

  it('does not authorize a generic API zero when trusted DOM never becomes ready', async () => {
    const fixture = browserFixture({
      emitApiOnGoto: true,
      apiPayload: { data: { offers: [] } },
      additionalApiPayload: { data: { offers: [{ unexpected: true }] } },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
  });

  it.each([
    { name: 'malformed collection', payload: { data: { offers: [{ unexpected: true }] } } },
    { name: 'unrecognized payload', payload: { data: { pagination: { page: 1 } } } },
  ])('does not authorize $name from a generic search response', async ({ payload }) => {
    const fixture = browserFixture({ emitApiOnGoto: true, apiPayload: payload });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
  });

  it('fails closed for a trusted blank page without API or ready DOM evidence', async () => {
    const fixture = browserFixture({ domReadiness: { kind: 'unready' } });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
  });

  it('waits for an accessible same-origin iframe to leave loading and report an explicit empty result', async () => {
    const fixture = browserFixture({
      domReadiness: { kind: 'unready' },
      frameReadiness: { kind: 'loading' },
      nextFrameReadiness: { kind: 'explicit_zero' },
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).resolves.toEqual([]);

    expect(fixture.sameOriginFrame?.evaluate).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('bounds same-origin iframe readiness inspection instead of accepting a late unbounded frame', async () => {
    const fixture = browserFixture({
      domReadiness: { kind: 'unready' },
      frameReadiness: { kind: 'unready' },
      extraFrameReadinesses: [
        { kind: 'unready' },
        { kind: 'unready' },
        { kind: 'explicit_zero' },
      ],
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.extraSameOriginFrames[2]?.evaluate).not.toHaveBeenCalled();
  });

  it('does not authorize a DOM result whose probe finishes after the shared monotonic deadline', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const fixture = browserFixture({
      domReadiness: {
        kind: 'items',
        records: [{
          href: 'https://detail.1688.com/offer/123456.html',
          title: 'late offer',
          salesText: '近30天成交 88 笔',
        }],
      },
    });
    fixture.page.evaluate.mockImplementation(() => {
      now = 6_001;
      return Promise.resolve({
        kind: 'items',
        records: [{
          href: 'https://detail.1688.com/offer/123456.html',
          title: 'late offer',
          salesText: '近30天成交 88 笔',
        }],
      });
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
  });

  it('fails a never-settling readiness probe by one fake monotonic deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    const fixture = browserFixture({ domReadiness: { kind: 'unready' } });
    fixture.page.evaluate.mockImplementation(() => new Promise(() => undefined));
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();
    let failure: unknown;
    void session.searchKeyword({ keyword: '儿童笔袋' }).catch((error: unknown) => {
      failure = error;
    });

    await vi.advanceTimersByTimeAsync(6_001);

    expect(failure).toMatchObject({ code: 'search_extraction_failed' });
    expect(fixture.page.close).toHaveBeenCalledOnce();
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
    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
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

  it.each([
    {
      name: 'live Korean slider challenge',
      pageText: '슬라이더를 드래그하여 인증을 완료하세요',
      reason: 'security_challenge',
    },
    {
      name: 'Chinese verification challenge',
      pageText: '请完成安全验证',
      reason: 'security_challenge',
    },
    {
      name: 'specific English security verification',
      pageText: 'Security verification is required before continuing',
      reason: 'security_challenge',
    },
    {
      name: 'specific English login prompt',
      pageText: 'Please log in to continue',
      reason: 'login',
    },
  ])('maps a $name that appears during loading to typed attention before the readiness deadline', async ({ pageText, reason }) => {
    const fixture = browserFixture({
      domReadiness: { kind: 'loading' },
      pageTextSequence: ['', '', pageText],
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordAttentionError',
      reason,
    });

    expect(fixture.page.evaluate).toHaveBeenCalledOnce();
    expect(fixture.page.close).toHaveBeenCalledOnce();
  });

  it.each([
    'Security camera wholesale products',
    'Login accessories wholesale products',
  ])('does not classify delayed ordinary product text as attention: %s', async (pageText) => {
    const fixture = browserFixture({
      domReadiness: { kind: 'loading' },
      pageTextSequence: ['', '', pageText],
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordProviderError',
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
  });

  it.each([
    {
      name: 'security-themed product text',
      keyword: 'Security camera wholesale products',
      pageText: 'Security camera wholesale products',
    },
    {
      name: 'security-verification product text',
      keyword: 'Security verification equipment wholesale',
      pageText: 'Security verification equipment wholesale',
    },
    {
      name: 'login-themed product text',
      keyword: 'login-themed product collection',
      pageText: 'Login-themed product collection',
    },
    {
      name: 'login-search product text',
      keyword: 'login search wholesale product',
      pageText: 'Login search wholesale product',
    },
    {
      name: 'ordinary empty trusted page',
      keyword: '儿童笔袋',
      pageText: '',
    },
  ])('fails closed without turning $name into operator attention', async ({ keyword, pageText }) => {
    const fixture = browserFixture({ pageText });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordProviderError',
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
    await session.close();
  });

  it('fails closed rather than classifying an ordinary trusted security category route as attention', async () => {
    const fixture = browserFixture({
      finalUrl: 'https://s.1688.com/security/wholesale-products.htm',
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: 'Security camera wholesale products' })).rejects.toMatchObject({
      name: 'Sourcing1688KeywordProviderError',
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).toHaveBeenCalledTimes(30);
    await session.close();
  });

  it.each([
    '请完成安全验证',
    'Security verification is required before continuing',
    'Security check is required before continuing',
    'Security challenge is required before continuing',
  ])('maps a specific challenge phrase to typed operator attention', async (pageText) => {
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
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'https://detail.1688.com/offer/123456.html',
        title: 'forged offer',
        salesText: '近30天成交 88 笔',
      }],
    });
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
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'https://detail.1688.com/offer/123456.html',
        title: 'forged redirect offer',
        salesText: '近30天成交 88 笔',
      }],
    });
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(fixture.browser as never);
    vi.stubEnv('SOURCING_PLAYWRIGHT_CDP_ENDPOINT', 'http://kiditem-office:9444');
    const session = await new Direct1688KeywordSearchAdapter().openSession();

    await expect(session.searchKeyword({ keyword: '儿童笔袋' })).rejects.toMatchObject({
      code: 'search_extraction_failed',
    });

    expect(fixture.page.evaluate).not.toHaveBeenCalled();
    await session.close();
  });

  it('rejects an untrusted main-frame redirect hop even when the final 1688 URL is trusted', async () => {
    const fixture = browserFixture({
      finalUrl: 'https://s.1688.com/selloffer/offer_search.htm',
      navigationResponseUrl: 'https://s.1688.com/selloffer/offer_search.htm',
      navigationRedirectUrls: [
        'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
        'https://evil.example/redirect',
        'https://s.1688.com/selloffer/offer_search.htm',
      ],
    });
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'https://detail.1688.com/offer/123456.html',
        title: 'forged redirect-hop offer',
        salesText: '近30天成交 88 笔',
      }],
    });
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
      navigationRedirectUrls: [
        'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
        'https://www.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
        'https://s.1688.com/selloffer/offer_search.htm?keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B',
      ],
      emitUntrustedSubresourceOnGoto: true,
    });
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
        title: 'allowed offer',
        salesText: '近30天成交 88 笔',
      }],
    });
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
    fixture.page.evaluate.mockResolvedValue({
      kind: 'items',
      records: [{
        href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
        title: 'trusted DOM offer',
        salesText: '近30天成交 88 笔',
      }],
    });
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

  it('allows a source-policy-approved challenge host to produce typed attention', async () => {
    const fixture = browserFixture({ finalUrl: 'https://captcha.1688.com/verify/' });
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
  domReadiness?: unknown;
  nextDomReadiness?: unknown;
  frameReadiness?: unknown;
  nextFrameReadiness?: unknown;
  extraFrameReadinesses?: unknown[];
  blockRenderWait?: boolean;
  blockGoto?: boolean;
  pageText?: string;
  pageTextSequence?: string[];
  apiPayload?: unknown;
  additionalApiPayload?: unknown;
  finalUrl?: string;
  apiResponseUrl?: string;
  navigationResponseUrl?: string;
  navigationRedirectUrls?: string[];
  emitUntrustedSubresourceOnGoto?: boolean;
}) {
  const events: string[] = [];
  let responseListener: ((response: unknown) => void) | undefined;
  let resolveGoto: (() => void) | undefined;
  let resolveRenderWait: (() => void) | undefined;
  let domReadiness: unknown = input?.domReadiness ?? { kind: 'unready' };
  let domReads = 0;
  let frameReads = 0;
  let textReads = 0;
  const apiResponseJson = vi.fn(async () => input?.apiPayload ?? ({ offers: [{
    offerId: '123456',
    title: 'API 儿童笔袋',
    offerUrl: 'https://detail.1688.com/offer/123456.html',
    tradeText: '近30天成交 88 笔',
  }] }));
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
        json: apiResponseJson,
      };
      if (input?.emitApiOnGoto) {
        responseListener?.(response);
        if (input.additionalApiPayload !== undefined) {
          responseListener?.({
            ...response,
            json: async () => input.additionalApiPayload,
          });
        }
        if (input.duplicateApiOnGoto) responseListener?.(response);
      }
      if (input?.emitUntrustedSubresourceOnGoto) {
        responseListener?.({
          url: () => 'https://cdn.evil.example/assets/product.png',
          headers: () => ({ 'content-type': 'image/png' }),
          json: vi.fn(),
        });
      }
      if (input?.lateApiOnGoto) setTimeout(() => responseListener?.(response), 5);
      if (input?.lateDomOnGoto) {
        setTimeout(() => {
          domReadiness = {
            kind: 'items',
            records: [{
              href: 'http://detail.m.1688.com/page/index.html?offerId=123456',
              title: 'delayed DOM 儿童笔袋',
              salesText: '近30天成交 88 笔',
            }],
          };
        }, 5);
      }
      if (input?.blockGoto) return new Promise<void>((resolve) => { resolveGoto = resolve; });
      return Promise.resolve(input?.navigationResponseUrl
        ? {
          url: () => input.navigationResponseUrl,
          request: () => redirectRequestChain(
            input.navigationRedirectUrls ?? [input.navigationResponseUrl as string],
          ),
        }
        : null);
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn((timeoutMs: number) => {
      testMonotonicNow += timeoutMs;
      return input?.blockRenderWait
        ? new Promise<void>((resolve) => { resolveRenderWait = resolve; })
        : new Promise<void>((resolve) => setTimeout(resolve, 5));
    }),
    evaluate: vi.fn(() => {
      const readiness = domReads === 0 ? domReadiness : input?.nextDomReadiness ?? domReadiness;
      domReads += 1;
      return Promise.resolve(readiness);
    }),
    locator: vi.fn(() => ({ innerText: vi.fn().mockImplementation(() => {
      const text = input?.pageTextSequence
        ? input.pageTextSequence[Math.min(textReads, input.pageTextSequence.length - 1)] ?? ''
        : input?.pageText ?? '';
      textReads += 1;
      return Promise.resolve(text);
    }) })),
    url: vi.fn(() => input?.finalUrl ?? 'https://s.1688.com/selloffer/offer_search.htm'),
    title: vi.fn().mockResolvedValue('1688 搜索'),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const mainFrame = { url: () => input?.finalUrl ?? 'https://s.1688.com/selloffer/offer_search.htm' };
  const sameOriginFrame = {
    url: () => input?.finalUrl ?? 'https://s.1688.com/selloffer/offer_search.htm',
    evaluate: vi.fn(() => {
      const readiness = frameReads === 0
        ? input?.frameReadiness ?? { kind: 'unready' }
        : input?.nextFrameReadiness ?? input?.frameReadiness ?? { kind: 'unready' };
      frameReads += 1;
      return Promise.resolve(readiness);
    }),
  };
  const extraSameOriginFrames = (input?.extraFrameReadinesses ?? []).map((readiness) => ({
    url: () => input?.finalUrl ?? 'https://s.1688.com/selloffer/offer_search.htm',
    evaluate: vi.fn(() => Promise.resolve(readiness)),
  }));
  Object.assign(page, {
    mainFrame: () => mainFrame,
    frames: () => [mainFrame, sameOriginFrame, ...extraSameOriginFrames],
  });
  const unrelatedPage = { close: vi.fn() };
  const context = { newPage: vi.fn().mockResolvedValue(page), pages: () => [unrelatedPage, page] };
  const browser = {
    contexts: () => [context],
    newContext: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    browser,
    context,
    events,
    apiResponse: { json: apiResponseJson },
    page,
    sameOriginFrame,
    extraSameOriginFrames,
    resolveGoto,
    resolveRenderWait,
    unrelatedPage,
  };
}

interface RedirectRequestFixture {
  url: () => string;
  redirectedFrom: () => RedirectRequestFixture | null;
}

function redirectRequestChain(urls: string[]): RedirectRequestFixture {
  let previous: RedirectRequestFixture | null = null;
  for (const url of urls) {
    const redirectedFrom = previous;
    const current = { url: () => url, redirectedFrom: () => redirectedFrom };
    previous = current;
  }
  if (!previous) throw new Error('navigation redirect chain requires at least one URL');
  return previous;
}

function waitForDelayedFixture(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

function apiOffer(title: string) {
  return {
    offerId: '123456',
    title,
    offerUrl: 'https://detail.1688.com/offer/123456.html',
    tradeText: '近30天成交 88 笔',
  };
}

function readyDomItems(title: string) {
  return {
    kind: 'items' as const,
    records: [{
      href: 'https://detail.1688.com/offer/123456.html',
      title,
      salesText: '近30天成交 88 笔',
    }],
  };
}
