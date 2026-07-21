import { describe, expect, it } from 'vitest';
import {
  coupangNamePrice,
  diceBigram,
  lcsLength,
  matchCoupangProductByName,
  normalizeCoupangName,
  type NameMatchEntry,
} from '../coupang-name-matcher';

describe('normalizeCoupangName', () => {
  it('브랜드/패키징/수량/무게/노이즈/숫자를 제거하고 코어만 남긴다', () => {
    expect(normalizeCoupangName('KY I&D 곰돌이전동카메라 비눗방울 (16개입) 혼합색상')).toBe('곰돌이전동카메라비눗방울');
    expect(normalizeCoupangName('Pack_18000 물티슈 100g 랜덤발송')).toBe('물티슈');
    expect(normalizeCoupangName('12000 아기욕조 대형 12개')).toBe('아기욕조대형');
  });

  it('앞자리 가격(숫자)은 코어에서 제거된다 — 가격은 별도 비교', () => {
    expect(normalizeCoupangName('18000곰돌이카메라')).toBe('곰돌이카메라');
  });
});

describe('coupangNamePrice', () => {
  it('브랜드/패키징 접두 뒤 3~6자리 앞자리 가격을 추출한다', () => {
    expect(coupangNamePrice('18000곰돌이카메라')).toBe('18000');
    expect(coupangNamePrice('KY I&D 12000 아기욕조')).toBe('12000');
    expect(coupangNamePrice('Pack_9900 물티슈')).toBe('9900');
  });

  it('앞에 가격이 없으면 null', () => {
    expect(coupangNamePrice('곰돌이카메라')).toBeNull();
  });
});

describe('lcsLength / diceBigram', () => {
  it('공통 최장 연속부분문자열 길이', () => {
    expect(lcsLength('곰돌이카메라', '곰돌이전동카메라')).toBe(3); // "곰돌이"
    expect(lcsLength('abcdef', 'zzcdefz')).toBe(4); // "cdef"
  });

  it('bigram Dice 유사도와 공통 bigram 수', () => {
    const same = diceBigram('아기욕조', '아기욕조');
    expect(same.dice).toBe(1);
    const none = diceBigram('아기욕조', '자동차량');
    expect(none.dice).toBe(0);
    expect(none.shared).toBe(0);
  });
});

describe('matchCoupangProductByName', () => {
  const index: NameMatchEntry[] = [
    { core: '곰돌이전동카메라비눗방울', price: '18000', stock: 200, name: '18000곰돌이전동카메라비눗방울' },
    { core: '아기욕조대형', price: '12000', stock: 5, name: '12000아기욕조대형' },
    { core: '아기욕조대형', price: '9900', stock: 99, name: '9900아기욕조대형(저가형)' },
  ];

  it('완전일치는 fuzzy=false', () => {
    const m = matchCoupangProductByName('곰돌이전동카메라비눗방울', '18000', index);
    expect(m).toEqual({ stock: 200, fuzzy: false, name: '18000곰돌이전동카메라비눗방울' });
  });

  it('가격 가드: 같은 이름이라도 가격이 다르면 그 후보를 배제한다', () => {
    // 코어는 아기욕조대형으로 같지만 가격 9900 을 요구 → 12000 후보는 제외, 9900 후보 매칭
    const m = matchCoupangProductByName('아기욕조대형', '9900', index);
    expect(m).toEqual({ stock: 99, fuzzy: false, name: '9900아기욕조대형(저가형)' });
  });

  it('포함 매칭(부분 문자열)도 fuzzy=false', () => {
    const idx: NameMatchEntry[] = [{ core: '아기욕조', price: null, stock: 3, name: '아기욕조' }];
    const m = matchCoupangProductByName('대형아기욕조세트', null, idx);
    expect(m).toEqual({ stock: 3, fuzzy: false, name: '아기욕조' });
  });

  it('퍼지 매칭(LCS/Dice)은 fuzzy=true 로 표시된다', () => {
    const idx: NameMatchEntry[] = [
      { core: '곰돌이전동카메라비눗방울총', price: null, stock: 7, name: '곰돌이전동카메라비눗방울총' },
    ];
    const m = matchCoupangProductByName('곰돌이전동카메라비눗방울건', null, idx);
    expect(m?.fuzzy).toBe(true);
    expect(m?.stock).toBe(7);
  });

  it('코어가 너무 짧으면(<2) 매칭하지 않는다', () => {
    expect(matchCoupangProductByName('a', null, index)).toBeNull();
  });

  it('전혀 다른 이름은 매칭되지 않는다', () => {
    expect(matchCoupangProductByName('완전히다른상품명입니다', null, index)).toBeNull();
  });
});
