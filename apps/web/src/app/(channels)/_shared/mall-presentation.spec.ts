import { describe, expect, it } from 'vitest';
import {
  mallAccentClass,
  mallMonogram,
  productMonogram,
  MALL_LISTING_STATE_PRESENTATION,
} from './mall-presentation';

describe('mallAccentClass', () => {
  it('같은 몰은 언제나 같은 색이다 — 표에서 열을 눈으로 따라가야 한다', () => {
    expect(mallAccentClass('coupang')).toBe(mallAccentClass('coupang'));
  });

  it('다른 몰은 대체로 다른 색을 받는다', () => {
    const keys = ['coupang', 'rocket', 'kidsnote', 'lotteon', 'gmarket'];
    expect(new Set(keys.map(mallAccentClass)).size).toBeGreaterThan(1);
  });
});

describe('mallMonogram', () => {
  it('한글은 첫 글자 하나', () => {
    expect(mallMonogram('키즈노트')).toBe('키');
  });

  it('영문은 앞 두 글자 대문자', () => {
    expect(mallMonogram('Coupang Wing')).toBe('CO');
  });

  it('빈 이름도 깨지지 않는다', () => {
    expect(mallMonogram('   ')).toBe('?');
  });
});

describe('MALL_LISTING_STATE_PRESENTATION', () => {
  it('오류와 확인필요만 사람을 부른다', () => {
    const attention = Object.entries(MALL_LISTING_STATE_PRESENTATION)
      .filter(([, value]) => value.attention)
      .map(([key]) => key);
    expect(attention.sort()).toEqual(['error', 'unknown']);
  });

  it('모든 상태에 라벨이 있다', () => {
    for (const value of Object.values(MALL_LISTING_STATE_PRESENTATION)) {
      expect(value.label.length).toBeGreaterThan(0);
    }
  });
});

describe('productMonogram', () => {
  it('앞의 가격코드를 건너뛴다 — 안 그러면 타일이 전부 숫자가 된다', () => {
    // 우리 상품명은 대부분 이렇게 생겼다.
    expect(productMonogram('3000심쿵!뽑기왕')).toBe('심');
    expect(productMonogram('700국어노트(8칸)')).toBe('국');
    expect(productMonogram('50000전문가용메탈요요')).toBe('전');
  });

  it('숫자로만 된 이름도 깨지지 않는다', () => {
    expect(productMonogram('3000')).toBe('3');
  });

  it('영문 상품은 앞 두 글자', () => {
    expect(productMonogram('LED Light Ball')).toBe('LE');
  });

  it('몰 이름 규칙과는 다르다 — 11번가는 몰에서 숫자를 지키다', () => {
    expect(mallMonogram('11번가')).toBe('1');
  });
});
