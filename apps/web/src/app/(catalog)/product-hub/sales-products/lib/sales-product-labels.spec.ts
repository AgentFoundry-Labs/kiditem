import { describe, expect, it } from 'vitest';
import { SALES_PRODUCT_STATUS_LABEL } from './sales-product-labels';

describe('판매상품 상태 이름', () => {
  it('보관한 상품을 삭제라고 부르지 않는다', () => {
    // `archived` 는 판매상품코드 · 단품 · 몰별 값이 그대로 남는 보관이다. 수집상품으로 되돌린
    // 상품도 이 상태를 쓰고 다시 올리면 되살아난다 — 지워진 것은 하나도 없다.
    expect(SALES_PRODUCT_STATUS_LABEL.archived).toBe('보관');
  });
});
