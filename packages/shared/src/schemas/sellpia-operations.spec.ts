import { describe, expect, it } from 'vitest';
import { OperationKindSchema, OperationLockKeySchema } from './operation.js';
import {
  SELLPIA_LOGIN_LOCK_KEY,
  SELLPIA_OPERATION_KINDS,
  SellpiaInventoryChunkHeaderSchema,
  SellpiaInventoryResultSchema,
  SellpiaProductProfitabilityResultSchema,
  SellpiaProfitProductSchema,
  SellpiaSalesResultSchema,
  SellpiaSalesRowSchema,
  SellpiaSalesScopeSchema,
} from './sellpia-operations.js';
import {
  MALL_ADMIN_LISTINGS_KIND,
  MALL_ADMIN_LISTING_OPERATION_MALLS,
  ROCKET_MATCHING_CSV_KIND,
  SABANGNET_LOGIN_LOCK_KEY,
  SABANGNET_MALL_LISTINGS_KIND,
  isMallAdminListingOperationMall,
} from './channels-operations.js';
import { MALL_ORDER_OPERATION_MALLS } from './orders-operations.js';

describe('wave3 kinds and lock keys (KID-361·363)', () => {
  it('kind names satisfy the contract grammar and owner prefixes', () => {
    for (const kind of [...SELLPIA_OPERATION_KINDS, SABANGNET_MALL_LISTINGS_KIND, MALL_ADMIN_LISTINGS_KIND, ROCKET_MATCHING_CSV_KIND]) {
      expect(OperationKindSchema.parse(kind)).toBe(kind);
    }
    expect(SELLPIA_OPERATION_KINDS.map((kind) => kind.split('.')[0])).toEqual(['products', 'analytics', 'analytics', 'channels']);
  });

  it('login lock keys are contract resource keys', () => {
    expect(OperationLockKeySchema.parse(SELLPIA_LOGIN_LOCK_KEY)).toBe('resource:sellpia:login');
    expect(OperationLockKeySchema.parse(SABANGNET_LOGIN_LOCK_KEY)).toBe('resource:sabangnet:login');
  });

  it('the first-batch malls moved both their orders and their admin listings (later malls move each separately, KID-380·381)', () => {
    for (const mallKey of ['icecream-mall', 'kidkids', 'art09', 'domeggook']) {
      expect(MALL_ADMIN_LISTING_OPERATION_MALLS as readonly string[]).toContain(mallKey);
      expect(MALL_ORDER_OPERATION_MALLS as readonly string[]).toContain(mallKey);
    }
    expect(isMallAdminListingOperationMall('gsshop')).toBe(false);
  });

  it('sales scope rejects a reversed range and accepts an empty one', () => {
    expect(SellpiaSalesScopeSchema.safeParse({ startDate: '2026-09-02', endDate: '2026-09-01' }).success).toBe(false);
    expect(SellpiaSalesScopeSchema.safeParse({}).success).toBe(true);
  });

  it('inventory header names the old snapshot source and a row count within the old 20,000 cap', () => {
    expect(SellpiaInventoryChunkHeaderSchema.parse({ source: 'sellpia_product_search', version: 1, rowCount: 2 })).toEqual({ source: 'sellpia_product_search', version: 1, rowCount: 2 });
    expect(SellpiaInventoryChunkHeaderSchema.safeParse({ source: 'sellpia_product_search', version: 1, rowCount: 0 }).success).toBe(false);
    expect(SellpiaInventoryChunkHeaderSchema.safeParse({ source: 'sellpia_product_search', version: 1, rowCount: 20_001 }).success).toBe(false);
    expect(SellpiaInventoryResultSchema.parse({ rows: 3, products: 5 })).toEqual({ rows: 3, products: 5 });
  });

  it('a sales row is one seller-day with finite metrics (negative allowed, the owner clamps)', () => {
    const row = { sellerId: '118', sellerName: '스마트스토어', date: '2026-09-01', price: -1_200.5, amount: 2, buyPrice: 700 };
    expect(SellpiaSalesRowSchema.parse(row)).toEqual(row);
    expect(SellpiaSalesRowSchema.safeParse({ ...row, date: '2026-9-1' }).success).toBe(false);
    expect(SellpiaSalesRowSchema.safeParse({ ...row, sellerName: ' ' }).success).toBe(false);
    expect(SellpiaSalesRowSchema.safeParse({ ...row, extra: 1 }).success).toBe(false);
    expect(SellpiaSalesResultSchema.parse({ days: 3, rows: 2 })).toEqual({ days: 3, rows: 2 });
  });

  it('a profit item is one product with its month facts and provider totals', () => {
    const product = {
      productCode: '92',
      optionCode: '1',
      productName: '첫째',
      salePrice: 2_000,
      buyPrice: 1_000,
      totalOrderAmount: 3_000,
      totalOrderQty: 3,
      totalInAmount: 1_500,
      totalInQty: 3,
      months: [{ yearMonth: '2026-08', orderQty: 3, orderAmount: 3_000, inQty: 3, inAmount: 1_500 }],
    };
    expect(SellpiaProfitProductSchema.parse(product)).toEqual(product);
    expect(SellpiaProfitProductSchema.safeParse({ ...product, months: [{ ...product.months[0], orderQty: -1 }] }).success).toBe(false);
    expect(SellpiaProfitProductSchema.safeParse({ ...product, months: [{ ...product.months[0], yearMonth: '2026-13' }] }).success).toBe(false);
    expect(SellpiaProductProfitabilityResultSchema.parse({
      months: 14,
      rows: 1,
      quality: { mappedRows: 1, unmappedRows: 0, contentChecksum: 'a'.repeat(64), contentByteCount: 10 },
    }).rows).toBe(1);
  });
});
