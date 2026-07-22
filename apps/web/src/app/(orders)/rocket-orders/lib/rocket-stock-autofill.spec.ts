import { describe, expect, it } from 'vitest';
import {
  computeStockAutoFillQuantities,
  computeStockAutoFillReasons,
  type AutoFillMatch,
  type AutoFillRow,
} from './rocket-stock-autofill';

const rows: AutoFillRow[] = [
  { poLineId: 'A', orderQuantity: 10, hasRecipe: false },
  { poLineId: 'B', orderQuantity: 10, hasRecipe: false },
  { poLineId: 'C', orderQuantity: 10, hasRecipe: true }, // 등록상품
];
const match = new Map<string, AutoFillMatch>([
  ['A', { matched: true, confirmQuantity: 7 }],
  ['B', { matched: true, confirmQuantity: 10 }],
]);

describe('computeStockAutoFillQuantities', () => {
  it('미등록·미편집 행만 서버 confirmQuantity 로 채운다', () => {
    const result = computeStockAutoFillQuantities(rows, match, new Set(), {});
    expect(result).toEqual({ A: 7, B: 10 }); // C(등록)는 건드리지 않음
  });

  it('⭐사용자가 편집한 행(touched)은 보존한다 — 늦게 온 매칭 응답이 덮어쓰지 않음', () => {
    const current = { A: 3 }; // 사용자가 A를 3으로 편집
    const result = computeStockAutoFillQuantities(rows, match, new Set(['A']), current);
    expect(result.A).toBe(3); // 보존
    expect(result.B).toBe(10); // 미편집은 자동채움
  });

  it('미매칭 행은 0', () => {
    const result = computeStockAutoFillQuantities(
      [{ poLineId: 'X', orderQuantity: 5, hasRecipe: false }],
      new Map(),
      new Set(),
      {},
    );
    expect(result.X).toBe(0);
  });
});

describe('computeStockAutoFillReasons', () => {
  it('부족 행에 기본 사유, 전량 확정 행은 사유 없음', () => {
    const reasons = computeStockAutoFillReasons(rows, { A: 7, B: 10 }, new Set(), {}, '재고부족');
    expect(reasons).toEqual({ A: '재고부족' }); // A는 7<10 부족, B는 10 전량
  });

  it('편집 행(touched)의 사유는 보존', () => {
    const reasons = computeStockAutoFillReasons(rows, { A: 7 }, new Set(['A']), { A: '수동사유' }, '재고부족');
    expect(reasons.A).toBe('수동사유');
  });
});
