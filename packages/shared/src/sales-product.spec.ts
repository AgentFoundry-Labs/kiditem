import { describe, expect, it } from 'vitest';
import { mallDisplayName } from './sales-product';

describe('mallDisplayName', () => {
  it('drops a leading consumer price of three or more digits', () => {
    expect(mallDisplayName('3500 게틀링 비눗방울총(1p)')).toBe('게틀링 비눗방울총(1p)');
    expect(mallDisplayName('700받아쓰기노트(10권)')).toBe('받아쓰기노트(10권)');
    expect(mallDisplayName('4500포도 말랑이')).toBe('포도 말랑이');
  });

  it('keeps numbers that are part of the name or carry a unit', () => {
    expect(mallDisplayName('110g 초경량 UV차단 3단 접이식 우산(1p)')).toBe('110g 초경량 UV차단 3단 접이식 우산(1p)');
    expect(mallDisplayName('100p 클립 세트')).toBe('100p 클립 세트');
    expect(mallDisplayName('500개입 고무밴드')).toBe('500개입 고무밴드');
    expect(mallDisplayName('1+1 5000돌고래비눗방울')).toBe('1+1 5000돌고래비눗방울');
    expect(mallDisplayName('2024')).toBe('2024');
  });
});
