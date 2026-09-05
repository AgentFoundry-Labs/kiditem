import { describe, expect, it } from 'vitest';
import {
  SourcingExtensionV1ProductSchema,
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

});
