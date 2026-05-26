import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tmapi1688ImageSearchAdapter } from './tmapi-1688-image-search.adapter';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

describe('Tmapi1688ImageSearchAdapter', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.TMAPI_TOKEN = 'tmapi-token';
    process.env.TMAPI_BASE_URL = 'https://tmapi.test';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('converts a Coupang image URL and searches by image', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { url: 'https://img.alicdn.com/converted.jpg' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          items: [
            {
              title: '儿童太阳镜 UV 防晒',
              price: '6.8',
              detail_url: 'https://detail.1688.com/offer/1.html',
              pic_url: 'https://img.alicdn.com/1.jpg',
            },
          ],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    globalThis.fetch = fetchMock as typeof fetch;

    const adapter = new Tmapi1688ImageSearchAdapter();
    const result = await adapter.searchByImage({
      imageUrl: 'https://image.coupangcdn.com/image.jpg',
      keyword: '키즈 선글라스',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://tmapi.test/tools/image-url-convert');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/taobao/search/image');
    expect(String(fetchMock.mock.calls[1][0])).toContain('img_url=https%3A%2F%2Fimg.alicdn.com%2Fconverted.jpg');
    expect(result.convertedImageUrl).toBe('https://img.alicdn.com/converted.jpg');
    expect(result.items[0]).toMatchObject({
      title: '儿童太阳镜 UV 防晒',
      priceCny: 6.8,
      sourceUrl: 'https://detail.1688.com/offer/1.html',
    });
  });

  it('fails clearly when TMAPI_TOKEN is missing', async () => {
    delete process.env.TMAPI_TOKEN;
    const adapter = new Tmapi1688ImageSearchAdapter();

    await expect(adapter.searchByImage({ imageUrl: 'https://image.coupangcdn.com/image.jpg' }))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('wraps upstream failures', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad gateway', { status: 502 })) as typeof fetch;
    const adapter = new Tmapi1688ImageSearchAdapter();

    await expect(adapter.searchByImage({ imageUrl: 'https://image.coupangcdn.com/image.jpg' }))
      .rejects.toBeInstanceOf(BadGatewayException);
  });
});
