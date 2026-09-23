import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateProductGenerationDto } from '../product-generation.dto';
import { RegisterManualProductDto } from '../register-manual-product.dto';

/**
 * 직접 작성 상품의 원가는 상품 사실이 아니다 — 원가는 이은 구성품의 매입가에서 나온다
 * (`resolveUnitCost`, KID-313). 그래서 두 요청 모두 `costPrice` 를 받지 않는다. 전역 파이프와
 * 같은 설정으로 돌려, 보낸 원가가 명령까지 가지 않음을 확인한다.
 */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

describe('direct product request bodies', () => {
  it.each([
    ['product-generation', CreateProductGenerationDto],
    ['product-registration', RegisterManualProductDto],
  ])('never carries a typed cost price into the %s command', async (_route, metatype) => {
    const body = await pipe.transform(
      { title: '직접 만든 상품', imageUrls: [], salePrice: 12_000, costPrice: 4_000 },
      { type: 'body', metatype },
    );

    expect(body).toMatchObject({ title: '직접 만든 상품', salePrice: 12_000 });
    expect(body).not.toHaveProperty('costPrice');
  });
});
