import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { orderCollectionOrderCount } from '@kiditem/shared/order-collection-source';

/**
 * 수집 장부에 적는 수는 **주문 수** 하나다.
 *
 * 출력 줄을 그대로 적으면 셀피아 양식이 묶음마다 붙이는 택배비 줄만큼 부풀어, 같은 카드의
 * '당일'(서버 기록)이 '신규'(브라우저 기록)보다 커진다 — 아이스크림몰 38 대 18
 * (사장님 2026-09-22). 그 날 실제로 걷은 주문은 18 이었고 38 은 엑셀 줄 수였다.
 *
 * 한 번 고쳤는데 다른 컨트롤러의 재변환 경로 한 곳이 남아 같은 날 다시 났다. 그래서 규칙을
 * 눈으로 지키지 않고 원문을 훑어 잠근다.
 */
const CONTROLLERS = [
  'order-collection.controller.ts',
  'order-collection-source.controller.ts',
] as const;

function controllerSource(fileName: string): string {
  return readFileSync(join(__dirname, '..', 'controllers', fileName), 'utf8');
}

describe('수집 장부의 건수', () => {
  it('셈법은 하나다 — 출력 줄 − 상품 줄', () => {
    // 아이스크림몰 2026-09-22 13:48 실측: 상품 20 줄 + 묶음 18 개 = 출력 38 줄.
    expect(orderCollectionOrderCount({ outputRows: 38, productRows: 20 })).toBe(18);
    expect(orderCollectionOrderCount({ outputRows: 32, productRows: 17 })).toBe(15);
    // 걷었는데 없었다 — 0 은 측정이다.
    expect(orderCollectionOrderCount({ outputRows: 0, productRows: 0 })).toBe(0);
    // 모르는 것은 0 이 아니다.
    expect(orderCollectionOrderCount({ outputRows: null, productRows: 3 })).toBeNull();
  });

  it.each(CONTROLLERS)('⭐ %s 는 출력 줄을 건수로 적지 않는다', (fileName) => {
    const source = controllerSource(fileName);
    // `rowCount:` 에 딸려 오는 값에 출력 줄이 그대로 실리면 안 된다.
    expect(source).not.toMatch(/rowCount:\s*(?:\w+\.)?outputRows/);
  });

  it.each(CONTROLLERS)('%s 의 recordCollectedRows 는 공용 셈법을 부른다', (fileName) => {
    const source = controllerSource(fileName);
    if (!source.includes('recordCollectedRows')) return;
    expect(source).toMatch(/orderCollectionOrderCount|orderCount\(/);
  });
});
