import { describe, expect, it } from 'vitest';
import { mallOrdersOrderCount, orderCollectionOrderCount } from './order-collection-source.js';

describe('order collection order count', () => {
  it('주문 줄 + 상품 줄을 쓰는 양식은 출력 줄 − 상품 줄(아이스크림몰 2026-09-22 실측: 32 − 17 = 15)', () => {
    expect(orderCollectionOrderCount({ outputRows: 32, productRows: 17 })).toBe(15);
    expect(orderCollectionOrderCount({ outputRows: null, productRows: 17 })).toBeNull();
  });

  it('택배비가 상품 행의 칸이라 주문 줄이 없는 몰(해법몰·아트공구)은 서로 다른 주문번호 수다(KID-380 D6)', () => {
    // 해법몰 QA: 한 주문의 상품 한 줄 — 출력 1 · 상품 1이라 옛 셈법은 0이었다(화면마다 1 대 0).
    expect(mallOrdersOrderCount({ mallKey: 'haebub-mall', conversion: { outputRows: 1, productRows: 1 }, orderNumbers: ['1001'] })).toBe(1);
    expect(mallOrdersOrderCount({ mallKey: 'haebub-mall', conversion: { outputRows: 3, productRows: 3 }, orderNumbers: ['1001', '1002'] })).toBe(2);
    expect(mallOrdersOrderCount({ mallKey: 'art09', conversion: { outputRows: 2, productRows: 2 }, orderNumbers: ['20260926-0000001'] })).toBe(1);
  });

  it('그 밖의 몰은 2026-09-22 셈법 그대로(사장님 63 대 82), 변환할 것이 없던 수집은 0', () => {
    expect(mallOrdersOrderCount({ mallKey: 'kidkids', conversion: { outputRows: 7, productRows: 4 }, orderNumbers: ['a', 'b', 'c', 'd'] })).toBe(3);
    expect(mallOrdersOrderCount({ mallKey: 'haebub-mall', conversion: null, orderNumbers: ['1001'] })).toBe(0);
    expect(mallOrdersOrderCount({ mallKey: 'kidkids', conversion: { outputRows: null, productRows: null } })).toBe(0);
  });
});
