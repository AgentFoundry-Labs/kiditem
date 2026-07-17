import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkfoxEchotikShadowAdapter } from './linkfox-echotik-shadow.adapter';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_API_KEY = process.env.LINKFOX_AGENT_API_KEY;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LinkfoxEchotikShadowAdapter', () => {
  beforeEach(() => {
    process.env.LINKFOX_AGENT_API_KEY = 'linkfox-test-secret';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_API_KEY == null) delete process.env.LINKFOX_AGENT_API_KEY;
    else process.env.LINKFOX_AGENT_API_KEY = ORIGINAL_API_KEY;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls the fixed production endpoint once and normalizes official fields', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      errorCode: 200,
      total: 91,
      costToken: 4.5,
      products: [
        {
          asin: '1729000111111111',
          title: 'DIY sticker book',
          region: 'US',
          price: 12.5,
          minPrice: 10,
          maxPrice: 15,
          currency: 'USD',
          totalSaleCnt: 920,
          totalSale30dCnt: 480,
          totalSaleGmvAmt: 11_500,
          salesTrendFlagText: '1',
          totalVideoCnt: 44,
          totalLiveCnt: 5,
          totalIflCnt: 19,
          productCommissionRate: 12,
          productRating: 4.8,
          reviewCount: 203,
          availableDate: '2026-07-14',
          categoryId: '601739',
          imageUrl: 'https://images.example/cover.jpg#fragment',
          productImageUrls: [
            'https://images.example/cover.jpg',
            'https://images.example/detail.jpg',
          ],
          sourceTool: 'echotik',
        },
      ],
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'us',
      pageSize: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://tool-gateway.linkfox.com/echotik/listNewProductRank');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'linkfox-test-secret',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: '2026-07-15',
        region: 'US',
        pageNum: 1,
        pageSize: 20,
      }),
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({
      source: 'linkfox-echotik-new-product-rank',
      date: '2026-07-15',
      region: 'US',
      pageSize: 20,
      total: 91,
      costToken: 4.5,
      products: [
        {
          asin: '1729000111111111',
          title: 'DIY sticker book',
          region: 'US',
          price: 12.5,
          minPrice: 10,
          maxPrice: 15,
          currency: 'USD',
          totalSaleCnt: 920,
          totalSale30dCnt: 480,
          gmv: 11_500,
          salesTrendFlagText: '1',
          videoCount: 44,
          liveCount: 5,
          influencerCount: 19,
          commission: 12,
          rating: 4.8,
          reviewCount: 203,
          availableDate: '2026-07-14',
          categoryId: '601739',
          imageUrls: [
            'https://images.example/cover.jpg',
            'https://images.example/detail.jpg',
          ],
          raw: expect.objectContaining({
            totalSaleGmvAmt: 11_500,
            sourceTool: 'echotik',
          }),
        },
      ],
    });
    expect(result.generatedAt).toEqual(expect.any(String));
  });

  it('accepts the errcode alias and normalizes documented compatibility aliases', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({
      errcode: '200',
      total: '1',
      costToken: '4.5',
      products: [
        {
          productId: 'alias-product',
          productTitle: 'Alias title',
          avgPrice: '9.50',
          minimumPrice: '8',
          maximumPrice: '11',
          currencyCode: 'GBP',
          totalSales: '1,200',
          sales30d: '300',
          gmv: '10,500.25',
          salesTrend: 1,
          videoCount: '20',
          liveCount: '3',
          influencerCount: '8',
          commission: '10%',
          rating: '4.7',
          reviews: '41',
          firstSeenDate: '2026-07-01',
          category: 'alias-category',
          imageUrls: ['https://images.example/alias.jpg'],
          additionalEvidence: { campaign: 'summer' },
        },
      ],
    })) as unknown as typeof fetch;

    const result = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'GB',
    });

    expect(result.total).toBe(1);
    expect(result.costToken).toBe(4.5);
    expect(result.products[0]).toMatchObject({
      asin: 'alias-product',
      title: 'Alias title',
      region: 'GB',
      price: 9.5,
      minPrice: 8,
      maxPrice: 11,
      currency: 'GBP',
      totalSaleCnt: 1_200,
      totalSale30dCnt: 300,
      gmv: 10_500.25,
      salesTrendFlagText: '1',
      videoCount: 20,
      liveCount: 3,
      influencerCount: 8,
      commission: 10,
      rating: 4.7,
      reviewCount: 41,
      availableDate: '2026-07-01',
      categoryId: 'alias-category',
      imageUrls: ['https://images.example/alias.jpg'],
      raw: expect.objectContaining({
        additionalEvidence: { campaign: 'summer' },
      }),
    });
  });

  it('rejects unsupported regions instead of defaulting to US or accepting KR', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'KR',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails explicitly when LINKFOX_AGENT_API_KEY is missing', async () => {
    delete process.env.LINKFOX_AGENT_API_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'US',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, '인증'],
    [402, '포인트'],
  ])('sanitizes HTTP %i responses without reading or exposing their body', async (status, label) => {
    const upstreamSecret = `upstream-body-${status}-linkfox-test-secret`;
    const fetchMock = vi.fn(async () => new Response(upstreamSecret, { status }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'US',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain(label);
    expect((error as Error).message).not.toContain(upstreamSecret);
    expect((error as Error).message).not.toContain('linkfox-test-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects business failures, redacts errmsg and the API key, and does not retry', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      errorCode: 500,
      errmsg: 'internal debug linkfox-test-secret',
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'US',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toContain('code 500');
    expect((error as Error).message).not.toContain('internal debug');
    expect((error as Error).message).not.toContain('linkfox-test-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sanitizes network failures and makes only one request', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network diagnostic linkfox-test-secret');
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const error = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'US',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadGatewayException);
    expect((error as Error).message).toBe('LinkFox EchoTik 네트워크 요청에 실패했습니다.');
    expect((error as Error).message).not.toContain('linkfox-test-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts its only request after 15 seconds and returns a sanitized timeout', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('timeout detail linkfox-test-secret', 'AbortError'));
      }, { once: true });
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const request = new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'US',
    });
    const assertion = expect(request).rejects.toBeInstanceOf(GatewayTimeoutException);
    await vi.advanceTimersByTimeAsync(15_000);

    await assertion;
    const error = await request.catch((caught: unknown) => caught);
    expect((error as Error).message).not.toContain('linkfox-test-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps the request and normalized response at 50 products', async () => {
    const products = Array.from({ length: 60 }, (_, index) => ({
      asin: `product-${index}`,
      title: `Product ${index}`,
      region: 'FR',
    }));
    const fetchMock = vi.fn(async () => jsonResponse({
      errcode: 200,
      total: 60,
      costToken: 4.5,
      products,
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await new LinkfoxEchotikShadowAdapter().fetchNewProductRank({
      date: '2026-07-15',
      region: 'FR',
      pageSize: 500,
    });

    expect(result.pageSize).toBe(50);
    expect(result.products).toHaveLength(50);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      date: '2026-07-15',
      region: 'FR',
      pageNum: 1,
      pageSize: 50,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
