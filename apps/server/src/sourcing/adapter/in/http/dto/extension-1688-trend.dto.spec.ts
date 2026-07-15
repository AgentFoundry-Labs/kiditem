import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { IngestExtension1688TrendResultsDto } from './extension-1688-trend.dto';

describe('IngestExtension1688TrendResultsDto', () => {
  it('validates nested 1688 items and accepts the bounded extension contract', async () => {
    const dto = plainToInstance(IngestExtension1688TrendResultsDto, {
      runId: 'run-1',
      keywords: [
        {
          keyword: '文具',
          items: [
            {
              offerId: 'offer-1',
              title: '젤펜',
              priceCny: 0.81,
              monthlySales: 2_000,
              repurchaseRate: '35%',
              tradeScore: 88,
              supplierName: 'supplier',
              imageUrl: 'https://example.com/image.jpg',
              sourceUrl: 'https://detail.1688.com/offer/1.html',
              rank: 1,
            },
          ],
        },
      ],
      errors: [{ keyword: '儿童贴纸', message: 'slider required' }],
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects oversized nested batches and invalid item values', async () => {
    const dto = plainToInstance(IngestExtension1688TrendResultsDto, {
      runId: 'run-1',
      keywords: Array.from({ length: 21 }, (_, index) => ({
        keyword: `关键词${index}`,
        items: index === 0
          ? Array.from({ length: 21 }, () => ({
              offerId: '',
              priceCny: -1,
              monthlySales: 2_147_483_648,
              sourceUrl: 'javascript:alert(1)',
              rank: 21,
            }))
          : [],
      })),
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('keywords');
    expect(JSON.stringify(errors)).toContain('offerId');
    expect(JSON.stringify(errors)).toContain('monthlySales');
    expect(JSON.stringify(errors)).toContain('sourceUrl');
  });
});
