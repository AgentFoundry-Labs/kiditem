import { describe, expect, it } from 'vitest';
import {
  AdMetricUnparseableError,
  deriveAdTargetType,
  parseProviderNumber,
  readProviderMetric,
  toNumberOrNull,
} from '../scrape-row-normalizers';

describe('deriveAdTargetType', () => {
  it('keeps advertising product-tab rows at product grain even with keyword labels', () => {
    expect(deriveAdTargetType('product', '키워드 보기')).toBe('product');
  });

  it('uses keyword grain for non-product rows with a keyword', () => {
    expect(deriveAdTargetType('campaign', '유아 장난감')).toBe('keyword');
  });

  it('falls back to campaign grain', () => {
    expect(deriveAdTargetType('campaign', null)).toBe('campaign');
  });
});

describe('provider number parsing', () => {
  it('keeps an observed zero and parses formatted provider cells', () => {
    expect(parseProviderNumber(0)).toBe(0);
    expect(parseProviderNumber('0')).toBe(0);
    expect(parseProviderNumber('1,234원')).toBe(1234);
    expect(parseProviderNumber('-12.5')).toBe(-12.5);
  });

  it('returns null, never 0, for an absent or unparseable cell', () => {
    for (const value of [undefined, null, '', '-', 'N/A', 'abc', Number.NaN, Infinity, {}]) {
      expect(parseProviderNumber(value), String(value)).toBeNull();
      expect(toNumberOrNull(value), String(value)).toBeNull();
    }
  });
});

describe('readProviderMetric', () => {
  it('rounds a parsed cell and stores a column the grid did not carry as 0', () => {
    expect(readProviderMetric('1,234.6', true, 'spend')).toBe(1235);
    expect(readProviderMetric(undefined, false, 'clicks')).toBe(0);
  });

  it('rejects an observed unparseable cell with a typed error naming the metric', () => {
    let error: unknown;
    try {
      readProviderMetric('N/A', true, 'clicks');
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(AdMetricUnparseableError);
    expect(error).toMatchObject({ code: 'AD_METRIC_UNPARSEABLE', field: 'clicks' });
  });
});
