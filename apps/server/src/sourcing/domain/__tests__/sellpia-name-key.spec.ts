import { describe, expect, it } from 'vitest';
import { sellpiaNameJoinKey } from '../sellpia-name-key';

describe('sellpiaNameJoinKey', () => {
  it('NFKC 정규화 + 소문자 + 공백 제거만 한다', () => {
    expect(sellpiaNameJoinKey('  Rainbow  Slime  ')).toBe('rainbowslime');
    // 전각 문자는 NFKC 로 반각이 된다 (DB 의 normalize(name, NFKC) 와 같다).
    expect(sellpiaNameJoinKey('ＫＩＤ Ｉｔｅｍ')).toBe('kiditem');
  });

  it('선행 가격 숫자와 판매단위 꼬리표를 벗기지 않는다', () => {
    // Inventory 의 DB 술어가 안 벗기므로 여기서도 벗기면 안 된다. 여기서
    // 규칙을 넓히면 조회가 조용히 0건이 된다.
    expect(sellpiaNameJoinKey('4000 과일바구니 딸깍이 키링')).toBe('4000과일바구니딸깍이키링');
    expect(sellpiaNameJoinKey('무지개 슬라임 10개입')).toBe('무지개슬라임10개입');
  });

  it('괄호와 특수문자도 그대로 남긴다', () => {
    expect(sellpiaNameJoinKey('키링(대) - A형')).toBe('키링(대)-a형');
  });

  it('빈 값과 공백뿐인 이름은 null 이다', () => {
    expect(sellpiaNameJoinKey('')).toBeNull();
    expect(sellpiaNameJoinKey('   ')).toBeNull();
    expect(sellpiaNameJoinKey(null)).toBeNull();
    expect(sellpiaNameJoinKey(undefined)).toBeNull();
  });
});
