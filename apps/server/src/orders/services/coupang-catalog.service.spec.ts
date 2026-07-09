import { describe, expect, it } from 'vitest';
import { coupangNamePrice, diceBigram, lcsLength, normalizeCoupangName, parsePackQty } from './coupang-catalog.service';

describe('coupang-catalog matching', () => {
  it('parsePackQty parses N개입/N개, ignores non-bundles', () => {
    expect(parsePackQty('KY I&D 자연나라관찰채집통3개입 랜덤발송')).toBe(3);
    expect(parsePackQty('2000바풍투톤슬라임 12개')).toBe(12);
    expect(parsePackQty('1000 고리걸기수중게임(16개입)')).toBe(16);
    expect(parsePackQty('단품 상품명')).toBeNull();
    expect(parsePackQty('1개')).toBeNull();
  });

  it('normalizeCoupangName reduces to core (strips brand/qty/weight/price)', () => {
    // ⭐쿠팡 브랜드접두("KY I&D") vs 셀피아 가격접두("4000") — 코어가 같아야 매칭
    expect(normalizeCoupangName('KY I&D 자연나라관찰채집통3개입 랜덤발송')).toBe(
      normalizeCoupangName('4000자연나라관찰채집통'),
    );
    // 수량 + 무게 제거
    expect(normalizeCoupangName('삼겹살말랑이구이 4개 혼합색상 72g 4개')).toBe(
      normalizeCoupangName('2000삼겹살말랑이구이'),
    );
    // 묶음명 코어 = 낱개명 코어
    expect(normalizeCoupangName('2000바풍투톤슬라임 12개')).toBe(normalizeCoupangName('2000바풍투톤슬라임'));
  });

  it('coupangNamePrice extracts leading price for the false-match guard', () => {
    // 가격만 다른 상품 — 코어는 같지만 가격 가드로 걸러진다
    expect(coupangNamePrice('2000 12색도장싸인펜(12개입)')).toBe('2000');
    expect(coupangNamePrice('2500 12색도장싸인펜')).toBe('2500');
    expect(coupangNamePrice('4000자연나라관찰채집통')).toBe('4000');
    // 브랜드접두 = 가격 없음 → 가드 안 걸리고 매칭 허용
    expect(coupangNamePrice('KY I&D 자연나라관찰채집통3개입')).toBeNull();
    expect(coupangNamePrice('안테나 왕 잠자리채 2개')).toBeNull();
  });

  it('normalizeCoupangName strips "쿠팡용" noise so 셀피아 (쿠팡용) 접미가 코어를 오염시키지 않음', () => {
    expect(normalizeCoupangName('길어져랏(쿠팡용) 안테나잠자리채')).toBe(
      normalizeCoupangName('길어져랏 안테나잠자리채'),
    );
  });

  it('lcsLength = 공통 최장 연속부분문자열 길이 (퍼지 매칭 임계값의 기반)', () => {
    expect(lcsLength('abcdef', 'zzcdefzz')).toBe(4); // "cdef"
    expect(lcsLength('abc', 'xyz')).toBe(0);
    // 이름이 갈려도("길이조절" ↔ "길어져랏") 핵심 "안테나잠자리채"(7자)가 겹쳐 퍼지 임계값(≥6) 통과
    const coupang = normalizeCoupangName('안테나 잠자리채 길이조절');
    const sellpia = normalizeCoupangName('길어져랏(쿠팡용) 안테나잠자리채');
    expect(lcsLength(coupang, sellpia)).toBeGreaterThanOrEqual(6);
    // 전혀 다른 상품은 긴 공통구간이 없음 → 퍼지에도 안 걸림
    expect(lcsLength(normalizeCoupangName('물총'), normalizeCoupangName('색칠공부'))).toBeLessThan(6);
  });

  it('diceBigram = 중간 단어만 치환된 이름을 잡는다 (연속 LCS가 놓치는 케이스)', () => {
    // "유니콘물게임기" ↔ "유니콘워터게임기" (물=워터): 연속 공통구간은 "유니콘"/"게임기"(각 3) 뿐 → LCS<6
    const coupang = normalizeCoupangName('KY I&D 유니콘물게임기4개입');
    const sellpia = normalizeCoupangName('2500유니콘워터게임기');
    expect(lcsLength(coupang, sellpia)).toBeLessThan(6); // 연속 LCS로는 못 잡음
    const { dice, shared } = diceBigram(coupang, sellpia);
    expect(shared).toBeGreaterThanOrEqual(3);
    expect(dice).toBeGreaterThanOrEqual(0.5); // Dice 퍼지 임계값 통과 → 후보로 잡힘
    // 무관한 상품은 Dice 낮음
    expect(diceBigram(normalizeCoupangName('물총'), normalizeCoupangName('색칠공부')).dice).toBeLessThan(0.5);
  });
});
