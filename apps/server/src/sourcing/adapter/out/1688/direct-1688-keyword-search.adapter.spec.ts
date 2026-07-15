import { BadGatewayException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Direct1688KeywordSearchAdapter } from './direct-1688-keyword-search.adapter';

const playwrightMocks = vi.hoisted(() => ({
  connectOverCDP: vi.fn(),
  launchPersistentContext: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: playwrightMocks,
}));

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('Direct1688KeywordSearchAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DIRECT_1688_MTOP_BASE_URL = 'https://h5api.test';
    delete process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT;
    playwrightMocks.connectOverCDP.mockReset();
    playwrightMocks.launchPersistentContext.mockReset();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('searches 1688 directly and normalizes mtop offer rows', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: ['FAIL_SYS_TOKEN_EMPTY::令牌为空'],
        data: {},
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': '_m_h5_tk=abc123_1779830239226; Path=/; Domain=1688.com; Max-Age=5400, _m_h5_tk_enc=encoded; Path=/; Domain=1688.com; Max-Age=5400',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: ['SUCCESS::调用成功'],
        data: {
          data: {
            OFFER: {
              items: [
                {
                  data: {
                    title: '<font color=red>儿童</font>餐垫 防水 硅胶',
                    offerId: '773667152445',
                    offerPicUrl: 'https://cbu01.alicdn.com/1.jpg',
                    bookedCount: '4552',
                    shopAddition: {
                      text: '义乌市筱琦贸易有限公司',
                      quantityPrices: [{ quantity: '≥1件', value: '4.29' }],
                    },
                    tags: [{ text: '回头率53%' }],
                  },
                },
              ],
            },
          },
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const adapter = new Direct1688KeywordSearchAdapter();
    const result = await adapter.searchByKeyword({
      keyword: '儿童餐垫',
      page: 2,
      maxResults: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchUrl = String(fetchMock.mock.calls[1][0]);
    expect(searchUrl).toContain('/h5/mtop.relationrecommend.wirelessrecommend.recommend/2.0/');
    expect(searchUrl).toContain('appKey=12574478');
    expect(searchUrl).toContain('sign=');
    const requestData = JSON.parse(new URL(searchUrl).searchParams.get('data') ?? '{}') as {
      params: string;
    };
    expect(JSON.parse(requestData.params)).toMatchObject({
      beginPage: 2,
      keywords: '儿童餐垫',
      charset: 'utf8',
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        Cookie: expect.stringContaining('_m_h5_tk=abc123_1779830239226'),
      }),
    });
    expect(result).toMatchObject({
      keyword: '儿童餐垫',
      page: 2,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      offerId: '773667152445',
      title: '儿童餐垫 防水 硅胶',
      priceCny: 4.29,
      sourceUrl: 'https://detail.1688.com/offer/773667152445.html',
      imageUrl: 'https://cbu01.alicdn.com/1.jpg',
      monthlySales: 4552,
      repurchaseRate: '53%',
      supplierName: '义乌市筱琦贸易有限公司',
    });
  });

  it('is configured without TMAPI credentials', () => {
    delete process.env.TMAPI_TOKEN;

    expect(new Direct1688KeywordSearchAdapter().getStatus()).toEqual({
      configured: true,
      baseUrl: 'https://h5api.test',
    });
  });

  it('wraps mtop error responses', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: {
          'Set-Cookie': '_m_h5_tk=abc123_1779830239226; Path=/; Domain=1688.com, _m_h5_tk_enc=encoded; Path=/; Domain=1688.com',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: ['FAIL_SYS_ILLEGAL_ACCESS::非法请求'],
        data: {},
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(new Direct1688KeywordSearchAdapter().searchByKeyword({ keyword: '儿童餐垫' }))
      .rejects.toBeInstanceOf(BadGatewayException);
  });

  it('reports an actionable error instead of treating an empty result as a successful collection', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', {
        status: 200,
        headers: {
          'Set-Cookie': '_m_h5_tk=abc123_1779830239226; Path=/; Domain=1688.com, _m_h5_tk_enc=encoded; Path=/; Domain=1688.com',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ret: ['SUCCESS::调用成功'],
        data: { data: { OFFER: { items: [] } } },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof fetch;

    await expect(new Direct1688KeywordSearchAdapter().searchByKeyword({ keyword: '儿童文具' }))
      .rejects.toThrow('1688 검색 결과가 0건');
  });

  it('uses the configured CDP browser so an existing 1688 login session is available', async () => {
    process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
    mockMtopUserValidationFailure();
    const { browser, page } = mockCdpBrowserSession();

    const result = await new Direct1688KeywordSearchAdapter().searchByKeyword({
      keyword: '儿童笔袋',
      maxResults: 1,
    });

    expect(playwrightMocks.connectOverCDP).toHaveBeenCalledWith(
      'http://127.0.0.1:9222',
      { timeout: 20_000 },
    );
    expect(playwrightMocks.launchPersistentContext).not.toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith(
      expect.stringMatching(/keywords=%E5%84%BF%E7%AB%A5%E7%AC%94%E8%A2%8B.*charset=utf8/),
      { waitUntil: 'commit', timeout: 45_000 },
    );
    expect(result.items[0]).toEqual(expect.objectContaining({
      offerId: '9001',
      title: '儿童笔袋 大容量',
    }));
    expect(page.close).toHaveBeenCalled();
    expect(browser.close).toHaveBeenCalled();
  });

  it('continues extraction when navigation times out after the 1688 document URL committed', async () => {
    process.env.SOURCING_PLAYWRIGHT_USER_DATA_DIR = '/tmp/kiditem-1688-keyword-test-profile';
    mockMtopUserValidationFailure();
    const page = buildSearchPageMock();
    const timeout = new Error('page.goto: Timeout 45000ms exceeded.');
    timeout.name = 'TimeoutError';
    page.goto.mockRejectedValueOnce(timeout);
    const context = {
      pages: vi.fn(() => [page]),
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
    };
    playwrightMocks.launchPersistentContext.mockResolvedValue(context);

    const result = await new Direct1688KeywordSearchAdapter().searchByKeyword({
      keyword: '文具',
      maxResults: 1,
    });

    expect(page.waitForLoadState).toHaveBeenCalledWith('domcontentloaded', { timeout: 12_000 });
    expect(result.items).toHaveLength(1);
    expect(context.close).toHaveBeenCalled();
    expect(playwrightMocks.launchPersistentContext).toHaveBeenCalledWith(
      '/tmp/kiditem-1688-keyword-test-profile',
      expect.not.objectContaining({ userAgent: expect.anything() }),
    );
  });

  it('detects an h5api punish response even when the main search page still looks normal', async () => {
    process.env.SOURCING_PLAYWRIGHT_CDP_ENDPOINT = 'http://127.0.0.1:9222';
    mockMtopUserValidationFailure();
    const page = buildSearchPageMock();
    page.goto.mockImplementationOnce(async () => {
      page.emitResponse('https://h5api.m.1688.com/_____tmd_____/punish?x5secdata=blocked&action=captcha');
      return null;
    });
    mockCdpBrowserSession(page);

    await expect(new Direct1688KeywordSearchAdapter().searchByKeyword({ keyword: '文具' }))
      .rejects.toThrow('SOURCING_PLAYWRIGHT_CDP_ENDPOINT로 연결된 Chrome에서 열린 검색 검증');

    expect(page.off).toHaveBeenCalledWith('response', expect.any(Function));
  });
});

function mockMtopUserValidationFailure(): void {
  globalThis.fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', {
      status: 200,
      headers: {
        'Set-Cookie': '_m_h5_tk=abc123_1779830239226; Path=/; Domain=1688.com, _m_h5_tk_enc=encoded; Path=/; Domain=1688.com',
      },
    }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      ret: ['FAIL_SYS_USER_VALIDATE::用户校验失败'],
      data: {},
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

function mockCdpBrowserSession(page = buildSearchPageMock()) {
  const context = {
    newPage: vi.fn(async () => page),
  };
  const browser = {
    contexts: vi.fn(() => [context]),
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
  playwrightMocks.connectOverCDP.mockResolvedValue(browser);
  return { browser, context, page };
}

function buildSearchPageMock() {
  const body = {
    waitFor: vi.fn(async () => undefined),
    innerText: vi.fn(async () => '儿童笔袋商品搜索结果'),
  };
  let responseListener: ((response: { url: () => string }) => void) | null = null;
  return {
    goto: vi.fn(async () => null),
    waitForLoadState: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    locator: vi.fn(() => body),
    evaluate: vi.fn(async (script: string) => script.includes('const normalizeUrl')
      ? [{
          offerId: '9001',
          title: '儿童笔袋 大容量',
          priceCny: 8.8,
          sourceUrl: 'https://detail.1688.com/offer/9001.html',
          imageUrl: 'https://cbu01.alicdn.com/9001.jpg',
          monthlySales: 1200,
          tradeScore: null,
          repurchaseRate: '35%',
          supplierName: '测试文具厂',
          score: 88,
        }]
      : undefined),
    setViewportSize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    url: vi.fn(() => 'https://s.1688.com/selloffer/offer_search.htm?keywords=%E6%96%87%E5%85%B7'),
    frames: vi.fn(() => []),
    on: vi.fn((_event: string, listener: (response: { url: () => string }) => void) => {
      responseListener = listener;
    }),
    off: vi.fn((_event: string, listener: (response: { url: () => string }) => void) => {
      if (responseListener === listener) responseListener = null;
    }),
    emitResponse: (url: string) => responseListener?.({ url: () => url }),
  };
}
