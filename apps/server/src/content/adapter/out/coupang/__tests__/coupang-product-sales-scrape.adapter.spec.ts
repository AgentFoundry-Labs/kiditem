import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { CoupangProductSalesScrapeAdapter } from '../coupang-product-sales-scrape.adapter';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe('CoupangProductSalesScrapeAdapter', () => {
  it('fails closed in production without directing callers to a removed Open API', async () => {
    process.env.NODE_ENV = 'production';
    const adapter = new CoupangProductSalesScrapeAdapter();

    await expect(adapter.scrapeByProductName('상품')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(adapter.scrapeByProductName('상품')).rejects.toThrow(
      'production에서는 현재 지원하지 않습니다.',
    );
  });
});
