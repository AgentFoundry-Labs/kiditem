import { describe, expect, it } from 'vitest';
import {
  SourcingExtensionV1ProductSchema,
  SourcingExtensionV2ProductSchema,
} from './extension';

describe('sourcing extension contracts', () => {
  it('keeps deployed v1 commercial snake_case fields', () => {
    const value = SourcingExtensionV1ProductSchema.parse({
      page_type: 'detail',
      source_url: 'https://detail.1688.com/offer/607635921546.html',
      source_platform: '1688',
      product_id: '607635921546',
      title: '어린이 실리콘 식판',
      price_min: 12.5,
      moq: 2,
      supplier_name: '샘플 공급사',
      sku_list: [{ sku_id: 'sku-1', price: 12.5 }],
      price_tiers: [{ beginAmount: 2, price: 12.5 }],
    });

    expect(value).toMatchObject({
      product_id: '607635921546',
      price_min: 12.5,
      moq: 2,
      supplier_name: '샘플 공급사',
    });
  });

  it('requires a complete and immutable v2 collection payload', () => {
    expect(() => SourcingExtensionV2ProductSchema.parse({
      schemaVersion: '2',
      collectionSessionId: '00000000-0000-4000-8000-000000000001',
      sourcePlatform: '1688',
      sourceUrl: 'https://detail.1688.com/offer/607635921546.html',
      externalOfferId: '607635921546',
      variantKey: '',
      title: '어린이 실리콘 식판',
      capturedAt: '2026-08-08T01:00:00.000Z',
      extractorVersion: '1688/v2',
      priceMin: 12.5,
      priceMax: null,
      minOrderQuantity: 2,
      supplierName: '샘플 공급사',
      skuAttributes: [],
      skuItems: [],
      priceTiers: [],
      rawPayloadHash: 'a'.repeat(64),
      ignoredByContract: true,
    })).toThrow();
  });
});
