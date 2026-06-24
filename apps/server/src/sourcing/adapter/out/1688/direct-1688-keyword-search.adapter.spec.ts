import { BadGatewayException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Direct1688KeywordSearchAdapter } from './direct-1688-keyword-search.adapter';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('Direct1688KeywordSearchAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DIRECT_1688_MTOP_BASE_URL = 'https://h5api.test';
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
});
