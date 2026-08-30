import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ReceiveExtensionDataDto } from './receive-extension-data.dto';

describe('ReceiveExtensionDataDto', () => {
  it('keeps deployed 1688 snake_case commercial fields through the production ValidationPipe', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    const body = await pipe.transform({
      page_type: 'detail',
      source_url: 'https://detail.1688.com/offer/607635921546.html',
      source_platform: '1688',
      product_id: '607635921546',
      title: '어린이 실리콘 식판',
      price_min: 12.5,
      price_max: 18.75,
      moq: 2,
      supplier_name: '샘플 공급사',
      specs: [{ key: '재질', value: '실리콘' }],
      sku_attrs: [{ name: '색상', values: ['분홍'] }],
      sku_list: [{ sku_id: 'sku-1', price: 12.5 }],
      price_tiers: [{ beginAmount: 2, price: 12.5 }],
      stripped_unknown: 'never reaches candidate data',
    }, {
      type: 'body',
      metatype: ReceiveExtensionDataDto,
    });

    expect(body).toMatchObject({
      price_min: 12.5,
      price_max: 18.75,
      moq: 2,
      supplier_name: '샘플 공급사',
      sku_list: [{ sku_id: 'sku-1', price: 12.5 }],
      price_tiers: [{ beginAmount: 2, price: 12.5 }],
    });
    expect(body).not.toHaveProperty('stripped_unknown');
  });
});
