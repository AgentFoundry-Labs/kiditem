import { describe, expect, it } from 'vitest';
import {
  buildCoupangNoticeDraft,
  categorySegments,
  normalizeOptionType,
  resolveNoticeCategory,
  type CoupangNoticeSource,
} from './coupang-notice-backfill';

function source(overrides: Partial<CoupangNoticeSource> = {}): CoupangNoticeSource {
  return {
    masterProductId: 'mp-1',
    productName: 'KY I&D 키즈구조대 불빛멜로디 우산',
    category: '[77386] 완구/취미>스포츠/야외완구>캐치볼',
    manufacturer: '케이와이아이앤디',
    brand: 'KY I&D',
    modelNumber: null,
    searchOptions: [
      { type: '[11932]최소 연령\n(기본 단위 : 개월)', value: '3세' },
      { type: '[11037]색상계열', value: '블루계열' },
      { type: '[7783]사이즈', value: '150x210mm' },
      { type: '[16411]Manufacturer Part Number', value: '' },
    ],
    ...overrides,
  };
}

describe('normalizeOptionType', () => {
  it('strips the coupang id prefix and the unit parenthetical', () => {
    expect(normalizeOptionType('[11932]최소 연령\n(기본 단위 : 개월)')).toBe('최소 연령');
    expect(normalizeOptionType('[11037]색상계열')).toBe('색상계열');
  });
});

describe('categorySegments', () => {
  it('drops the bracketed id and splits the path', () => {
    expect(categorySegments('[64681] 생활용품>생활잡화>기타생활용품>가정용품'))
      .toEqual(['생활용품', '생활잡화', '기타생활용품', '가정용품']);
    expect(categorySegments(null)).toEqual([]);
  });
});

describe('resolveNoticeCategory', () => {
  it('is confident about the toy root', () => {
    expect(resolveNoticeCategory('[77386] 완구/취미>스포츠/야외완구>캐치볼'))
      .toEqual({ noticeCategory: '어린이제품', confident: true });
  });

  it('is confident when any segment names a child audience', () => {
    expect(resolveNoticeCategory('[79914] 문구/오피스>문구/학용품>학용품세트'))
      .toEqual({ noticeCategory: '어린이제품', confident: true });
  });

  it('does not guess for a general household path', () => {
    // 오분류가 잘못된 송신으로 이어지지 않도록, 확신 못 한 건은 표시만 하고 넘긴다.
    expect(resolveNoticeCategory('[64681] 생활용품>생활잡화>기타생활용품>가정용품'))
      .toEqual({ noticeCategory: '기타재화', confident: false });
    expect(resolveNoticeCategory(null).confident).toBe(false);
  });
});

describe('buildCoupangNoticeDraft', () => {
  it('fills what the Wing export actually carries', () => {
    const draft = buildCoupangNoticeDraft(source());
    expect(draft.noticeCategory).toBe('어린이제품');
    expect(draft.attributes).toEqual({
      제조자: '케이와이아이앤디',
      사용연령: '3세',
      색상: '블루계열',
      크기: '150x210mm',
    });
  });

  it('always reports 제조국·KC·A/S as missing — the export has none of them', () => {
    expect(buildCoupangNoticeDraft(source()).missingFields)
      .toEqual(['제조국', 'KC인증필유무', 'AS책임자']);
  });

  it('falls back to the brand when 제조사 is blank', () => {
    expect(buildCoupangNoticeDraft(source({ manufacturer: '  ' })).attributes['제조자'])
      .toBe('KY I&D');
  });

  it('prefers 사이즈 over 길이 for 크기', () => {
    const draft = buildCoupangNoticeDraft(source({
      searchOptions: [
        { type: '[11157]길이\n(기본 단위 : cm)', value: '8.6cm' },
        { type: '[7783]사이즈', value: '소' },
      ],
    }));
    expect(draft.attributes['크기']).toBe('소');
  });

  it('uses 길이 when there is no 사이즈', () => {
    const draft = buildCoupangNoticeDraft(source({
      searchOptions: [{ type: '[11157]길이\n(기본 단위 : cm)', value: '8.6cm' }],
    }));
    expect(draft.attributes['크기']).toBe('8.6cm');
  });

  it('ignores blank option values such as the GTIN placeholders', () => {
    const draft = buildCoupangNoticeDraft(source({
      searchOptions: [{ type: '[16409]Global Trade Item Number', value: '' }],
    }));
    expect(draft.filledFields).toEqual(['제조자']);
  });

  it('keeps 품명및모델명 only for 기타재화, where it is required', () => {
    const other = buildCoupangNoticeDraft(source({
      category: '[64681] 생활용품>생활잡화>기타생활용품',
      modelNumber: 'A-1234',
    }));
    expect(other.attributes['품명및모델명']).toBe('A-1234');
    // 어린이제품 필수 항목에는 품명및모델명이 없다.
    expect(buildCoupangNoticeDraft(source({ modelNumber: 'A-1234' })).attributes['품명및모델명'])
      .toBeUndefined();
  });

  it('uses the product name when no model number exists', () => {
    const draft = buildCoupangNoticeDraft(source({ category: '[64681] 생활용품>생활잡화' }));
    expect(draft.attributes['품명및모델명']).toBe('KY I&D 키즈구조대 불빛멜로디 우산');
  });
});
