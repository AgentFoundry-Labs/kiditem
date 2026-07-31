import { describe, expect, it } from 'vitest';
import {
  isAdKeywordControlLabel,
  normalizeAdKeyword,
  normalizeAdKeywordOrigin,
} from '../ad-keyword';

describe('normalizeAdKeyword', () => {
  it('rejects the campaign grid keyword-column button label', () => {
    // Regression: the report grid `키워드` column holds a modal-open button, so
    // reading it by header stored the button label as the keyword on every
    // product row.
    expect(normalizeAdKeyword('키워드 보기')).toBeNull();
    expect(normalizeAdKeyword('키워드보기')).toBeNull();
    expect(normalizeAdKeyword('  키워드   보기  ')).toBeNull();
  });

  it('rejects other keyword-shaped control labels', () => {
    expect(normalizeAdKeyword('키워드 관리')).toBeNull();
    expect(normalizeAdKeyword('키워드 추가')).toBeNull();
    expect(normalizeAdKeyword('선택 상품')).toBeNull();
    expect(normalizeAdKeyword('View Keywords')).toBeNull();
  });

  it('keeps real keywords and collapses whitespace', () => {
    expect(normalizeAdKeyword('버블문어')).toBe('버블문어');
    expect(normalizeAdKeyword('  콩순이   비눗방울 ')).toBe('콩순이 비눗방울');
  });

  it('rejects blank, non-string, and implausibly long values', () => {
    expect(normalizeAdKeyword('')).toBeNull();
    expect(normalizeAdKeyword('   ')).toBeNull();
    expect(normalizeAdKeyword(null)).toBeNull();
    expect(normalizeAdKeyword(12345)).toBeNull();
    expect(normalizeAdKeyword('가'.repeat(201))).toBeNull();
    expect(normalizeAdKeyword('가'.repeat(200))).toHaveLength(200);
  });

  it('does not treat a keyword that merely contains a label word as a label', () => {
    expect(normalizeAdKeyword('비눗방울 키워드')).toBe('비눗방울 키워드');
  });
});

describe('isAdKeywordControlLabel', () => {
  it('identifies control labels regardless of spacing', () => {
    expect(isAdKeywordControlLabel('키워드 보기')).toBe(true);
    expect(isAdKeywordControlLabel('키워드보기')).toBe(true);
    expect(isAdKeywordControlLabel('버블문어')).toBe(false);
    expect(isAdKeywordControlLabel(null)).toBe(false);
  });
});

describe('normalizeAdKeywordOrigin', () => {
  it('only trusts an explicit registered marker', () => {
    expect(normalizeAdKeywordOrigin('registered')).toBe('registered');
  });

  it('defaults unknown values to smart targeting', () => {
    // A keyword the collector could not prove was registered is one Coupang
    // matched on its own.
    expect(normalizeAdKeywordOrigin('smart_targeting')).toBe('smart_targeting');
    expect(normalizeAdKeywordOrigin(undefined)).toBe('smart_targeting');
    expect(normalizeAdKeywordOrigin('REGISTERED')).toBe('smart_targeting');
    expect(normalizeAdKeywordOrigin(true)).toBe('smart_targeting');
  });
});
