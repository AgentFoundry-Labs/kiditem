import { describe, expect, it } from 'vitest';
import {
  buildNameMatchIndex,
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
  const index = buildNameMatchIndex([
    { core: '곰돌이전동카메라비눗방울', price: '18000', stock: 200, name: '18000곰돌이전동카메라비눗방울', skuId: 'sku-a' },
    { core: '아기욕조대형', price: '12000', stock: 5, name: '12000아기욕조대형', skuId: 'sku-b' },
    { core: '아기욕조대형', price: '9900', stock: 99, name: '9900아기욕조대형(저가형)', skuId: 'sku-c' },
  ]);

  it('완전일치는 fuzzy=false', () => {
    const m = matchCoupangProductByName('곰돌이전동카메라비눗방울', '18000', index);
    expect(m).toEqual({ stock: 200, fuzzy: false, name: '18000곰돌이전동카메라비눗방울', skuId: 'sku-a' });
  });

  it('가격 가드: 같은 이름이라도 가격이 다르면 그 후보를 배제한다', () => {
    // 코어는 아기욕조대형으로 같지만 가격 9900 을 요구 → 12000 후보는 제외, 9900 후보 매칭
    const m = matchCoupangProductByName('아기욕조대형', '9900', index);
    expect(m).toEqual({ stock: 99, fuzzy: false, name: '9900아기욕조대형(저가형)', skuId: 'sku-c' });
  });

  it('포함 매칭(부분 문자열)도 fuzzy=false', () => {
    const idx: NameMatchEntry[] = [{ core: '아기욕조', price: null, stock: 3, name: '아기욕조', skuId: 'sku-d' }];
    const m = matchCoupangProductByName('대형아기욕조세트', null, buildNameMatchIndex(idx));
    expect(m).toEqual({ stock: 3, fuzzy: false, name: '아기욕조', skuId: 'sku-d' });
  });

  it('퍼지 매칭(LCS/Dice)은 fuzzy=true 로 표시된다', () => {
    const idx: NameMatchEntry[] = [
      { core: '곰돌이전동카메라비눗방울총', price: null, stock: 7, name: '곰돌이전동카메라비눗방울총', skuId: 'sku-e' },
    ];
    const m = matchCoupangProductByName('곰돌이전동카메라비눗방울건', null, buildNameMatchIndex(idx));
    expect(m?.fuzzy).toBe(true);
    expect(m?.stock).toBe(7);
  });

  it('퍼지 후보가 여럿이면 점수 높은(더 많이 겹치는) 후보를 고른다', () => {
    // bigram 버킷 최적화가 후보를 놓치지 않고 최고점을 고르는지 검증(전수 스캔과 동일 결과).
    const idx = buildNameMatchIndex([
      { core: '무지개색블록쌓기놀이세트', price: null, stock: 1, name: '살짝겹침', skuId: 'sku-f' },
      { core: '알록달록블록쌓기놀이기차', price: null, stock: 2, name: '많이겹침', skuId: 'sku-g' },
    ]);
    const m = matchCoupangProductByName('알록달록블록쌓기놀이자동차', null, idx);
    expect(m?.fuzzy).toBe(true);
    expect(m?.name).toBe('많이겹침');
  });

  it('코어가 너무 짧으면(<2) 매칭하지 않는다', () => {
    expect(matchCoupangProductByName('a', null, index)).toBeNull();
  });

  it('전혀 다른 이름은 매칭되지 않는다', () => {
    expect(matchCoupangProductByName('완전히다른상품명입니다', null, index)).toBeNull();
  });
});
