import { describe, expect, it } from 'vitest';
import {
  byNewestSellpiaCodeFirst,
  sellpiaCodeOf,
} from '../mall-publishing.repository.adapter';

/**
 * 상품 등록 표가 서는 차례 — **셀피아 상품코드 번호가 큰 것부터**다.
 *
 * 셀피아가 번호를 차례로 내주므로 번호가 큰 것이 나중에 등록한 상품이다
 * (사장님 2026-09-18 "최신상품 순으로 하라니깐" · 2026-09-22 "셀피아에서 번호 상품코드가
 * 큰게 최신이잖아").
 *
 * 순서를 잠그는 테스트가 여태 하나도 없어서 두 번 어긋났다. 여기서 잠근다.
 */
const row = (sourceProductCode: string, sourceOptionCode = '', masterProductId = sourceProductCode) => ({
  sourceProductCode,
  sourceOptionCode,
  masterProductId,
});

describe('상품 등록 표의 차례', () => {
  it('⭐ 셀피아 번호가 큰 상품이 위에 선다', () => {
    const rows = [row('117'), row('10001'), row('2542'), row('9993')];
    expect([...rows].sort(byNewestSellpiaCodeFirst).map((r) => r.sourceProductCode))
      .toEqual(['10001', '9993', '2542', '117']);
  });

  it('⭐ 글자순이 아니라 숫자순이다 — 9993 이 10001 보다 위면 틀렸다', () => {
    const rows = [row('9993'), row('10001')];
    expect([...rows].sort(byNewestSellpiaCodeFirst)[0]!.sourceProductCode).toBe('10001');
  });

  it('옵션이 코드에 붙어 있어도 상품 번호로 읽는다 — 옛 상품은 `117-1` 꼴이다', () => {
    const rows = [row('117-1'), row('10001'), row('2542-1')];
    expect([...rows].sort(byNewestSellpiaCodeFirst).map((r) => r.sourceProductCode))
      .toEqual(['10001', '2542-1', '117-1']);
  });

  it('같은 상품의 옵션은 적힌 차례로 선다 — 한 상품이 흩어져 보이지 않게', () => {
    const rows = [row('500', '10', 'c'), row('500', '2', 'b'), row('500', '1', 'a')];
    expect([...rows].sort(byNewestSellpiaCodeFirst).map((r) => r.sourceOptionCode))
      .toEqual(['1', '2', '10']);
  });

  it('번호로 읽히지 않는 코드는 맨 뒤다 — 0 으로 접으면 옛 번호와 섞인다', () => {
    const rows = [row('ABC'), row('117'), row('')];
    expect([...rows].sort(byNewestSellpiaCodeFirst).map((r) => r.sourceProductCode)[0])
      .toBe('117');
  });

  it('화면에 적는 코드는 셀피아가 보여 주는 그대로다', () => {
    expect(sellpiaCodeOf({ sourceProductCode: '10487', sourceOptionCode: '1' })).toBe('10487-1');
    // 옛 상품은 이미 옵션이 붙어 있고 옵션 칸이 비어 있다 — 두 번 붙이지 않는다.
    expect(sellpiaCodeOf({ sourceProductCode: '117-1', sourceOptionCode: '' })).toBe('117-1');
    expect(sellpiaCodeOf({ sourceProductCode: '', sourceOptionCode: '' })).toBeNull();
  });
});
