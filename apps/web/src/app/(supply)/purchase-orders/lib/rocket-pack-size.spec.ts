import { describe, expect, it } from 'vitest';
import { availablePacks, parseCoupangPackSize } from './rocket-pack-size';

describe('parseCoupangPackSize', () => {
  it('"N개입" 묶음 수량을 뽑는다', () => {
    expect(parseCoupangPackSize('Pack_1000 불빛 슈팅 낙하산 (18개입) 색상혼합 25g 랜덤출고')).toBe(18);
    expect(parseCoupangPackSize('KY I&D 제로탄산슬라임 12개입 랜덤발송 1369g')).toBe(12);
    expect(parseCoupangPackSize('KY I&D 자연나라관찰채집통3개입 랜덤발송')).toBe(3);
  });

  it('"N개" 수량도 뽑는다', () => {
    expect(parseCoupangPackSize('베베 러브덕 비눗방울 노랑 24개')).toBe(24);
    expect(parseCoupangPackSize('KY I&D 아이큐브레인구슬퍼즐 4개 혼합색상')).toBe(4);
    expect(parseCoupangPackSize('퓨어 클리어 슬라임 투명 6개 164g')).toBe(6);
    expect(parseCoupangPackSize('곰돌이전동카메라 비눗방울 혼합색상 1개')).toBe(1);
  });

  it('수량 표기가 없으면 1(낱개)', () => {
    expect(parseCoupangPackSize('그냥 상품명')).toBe(1);
    expect(parseCoupangPackSize('')).toBe(1);
  });

  it('"개월" 같은 오탐은 피한다', () => {
    expect(parseCoupangPackSize('성장영양제 3개월분')).toBe(1);
  });
});

describe('availablePacks', () => {
  it('낱개 재고를 팩 크기로 내림 나눈다', () => {
    expect(availablePacks(7560, 18)).toBe(420);
    expect(availablePacks(29, 4)).toBe(7); // 29/4 = 7.25 → 7
    expect(availablePacks(0, 12)).toBe(0);
    expect(availablePacks(200, 1)).toBe(200);
  });

  it('팩 크기가 0이면 낱개 재고 그대로(방어)', () => {
    expect(availablePacks(50, 0)).toBe(50);
  });
});
