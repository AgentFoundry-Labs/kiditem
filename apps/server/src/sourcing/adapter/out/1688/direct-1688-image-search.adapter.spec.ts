import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Direct1688ImageSearchAdapter } from './direct-1688-image-search.adapter';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const lookupMock = vi.mocked(lookup);

describe('Direct1688ImageSearchAdapter', () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('reports the direct 1688 AlphaShop matcher as configured', () => {
    vi.stubEnv('DIRECT_1688_ALPHA_BASE_URL', 'https://alpha.test');
    const adapter = new Direct1688ImageSearchAdapter();

    expect(adapter.getStatus()).toEqual({
      configured: true,
      baseUrl: 'https://alpha.test',
    });
  });

  it('uploads the source image and returns AlphaShop 1688 candidates', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        retCode: 'S0000',
        success: true,
        result: {
          imageUrl: 'https://cbu01.alicdn.com/uploaded.jpg',
          currentRegion: '1,100,2,101',
          yoloCropRegion: '1,100,2,101',
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        retCode: 'S0000',
        success: true,
        pageNum: 1,
        pageSize: 12,
        total: 1,
        data: [
          {
            itemId: '773667152445',
            title: '儿童解压玩具捏捏乐',
            itemPrice: '4.29',
            offerDetailUrl: 'https://detail.1688.com/offer/773667152445.html?spm=a1688g.extenstion',
            imageUrl: 'https://cbu01.alicdn.com/1.jpg',
            sales: '4552',
            salesNum: 4552,
            providerInfo: {
              companyName: '义乌市筱琦贸易有限公司',
              factoryUrl: 'https://winport.m.1688.com/page/index.html?memberId=test',
              providerTags: [
                {
                  tagName: '원천 공장',
                  tagCode: 'SOURCE_FACTORY',
                },
              ],
            },
            purchaseTags: ['선결제 후배송'],
            purchaseInfos: [
              {
                code: 'o-qpl',
                value: '최소 주문량은 1개입니다',
                originValue: 1,
              },
            ],
            shipInfos: [
              {
                code: 'o-lyl',
                value: '98%',
              },
              {
                code: 'o-lsl',
                value: '94%',
              },
              {
                code: 'fhd',
                value: '浙江省金华市',
              },
            ],
            providerServices: [
              {
                code: 'p-fwf',
                originValue: 5,
              },
              {
                code: 'p-htl',
                value: '53%',
                originValue: 53,
              },
            ],
          },
        ],
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      maxResults: 8,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      imageBase64: expect.stringMatching(/^data:image\/jpeg;base64,/),
      regionRecognition: true,
      source: 'www.coupang.com',
      terminalId: 'Chrome_138.0.0.0',
      version: '0.1.2',
    });
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toMatchObject({
      imageUrl: 'https://cbu01.alicdn.com/uploaded.jpg',
      imageRegion: '1,100,2,101',
      platform: '1688',
      beginPage: 1,
      pageSize: 8,
      language: 'ko',
      currency: 'CNY',
    });
    expect(result).toEqual({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      convertedImageUrl: 'https://cbu01.alicdn.com/uploaded.jpg',
      items: [
        {
          title: '儿童解压玩具捏捏乐',
          priceCny: 4.29,
          sourceUrl: 'https://detail.1688.com/offer/773667152445.html',
          imageUrl: 'https://cbu01.alicdn.com/1.jpg',
          salesText: '4552',
          salesNum: 4552,
          supplierName: '义乌市筱琦贸易有限公司',
          supplierFactoryUrl: 'https://winport.m.1688.com/page/index.html?memberId=test',
          supplierTags: ['원천 공장'],
          purchaseTags: ['선결제 후배송'],
          minOrderQuantity: 1,
          shippingFulfillmentRate: '98%',
          shippingPickupRate: '94%',
          shipFrom: '浙江省金华市',
          serviceScore: 5,
          repurchaseRate: '53%',
          score: 100,
        },
      ],
    });
  });

  it('does not silently degrade an image match into a CDP-backed keyword search', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('upstream unavailable', {
      status: 502,
    })));

    await expect(adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      keyword: '말랑이',
      maxResults: 8,
    })).rejects.toThrow('1688 AlphaShop image search failed');

  });

  it('passes the operation signal through image download and upload without a browser fallback', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    const controller = new AbortController();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(Buffer.from('image-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }))
      .mockResolvedValueOnce(new Response('upload unavailable', { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      keyword: '말랑이',
      maxResults: 8,
      signal: controller.signal,
    })).rejects.toThrow('1688 AlphaShop image search failed');

    for (const call of fetchMock.mock.calls) {
      const signal = call[1]?.signal as AbortSignal | undefined;
      expect(signal).toBeDefined();
      expect(signal?.aborted).toBe(false);
    }
  });

  it('preserves the abort reason during a blocked source-image fetch and starts no next request', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    const blockedFetch = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(blockedFetch.promise);
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const reason = new Error('operation_attempt_fence_lost');

    const outcome = adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      keyword: '말랑이',
      signal: controller.signal,
    }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(reason);

    expect(await outcome).toBe(reason);
    expect(fetchMock).toHaveBeenCalledOnce();
    blockedFetch.resolve(new Response(Buffer.from('late-image')));
  });

  it('rejects an already-aborted operation before DNS or provider IO', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const reason = new Error('operation_deadline_exceeded');
    controller.abort(reason);

    await expect(adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
      keyword: '말랑이',
      signal: controller.signal,
    })).rejects.toBe(reason);
    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects source image hosts that resolve to private addresses before fetch', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    lookupMock.mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.searchByImage({
      imageUrl: 'https://metadata.example/image.jpg',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects redirects to private hosts before following them', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: {
        location: 'http://127.0.0.1/private.jpg',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when AlphaShop search fails and no keyword fallback is available', async () => {
    const adapter = new Direct1688ImageSearchAdapter();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('upstream unavailable', {
      status: 502,
    })));

    await expect(adapter.searchByImage({
      imageUrl: 'https://img.coupangcdn.com/example.jpg',
    })).rejects.toBeInstanceOf(BadGatewayException);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
