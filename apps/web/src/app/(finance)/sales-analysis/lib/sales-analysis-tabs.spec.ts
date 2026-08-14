import { describe, expect, it } from 'vitest';
import { parseSalesAnalysisTabId, SALES_ANALYSIS_TAB_IDS } from './sales-analysis-tabs';

describe('parseSalesAnalysisTabId', () => {
  it('opens the integrated sales analysis by default', () => {
    expect(parseSalesAnalysisTabId(undefined)).toBe('overview');
    expect(parseSalesAnalysisTabId('unknown')).toBe('overview');
  });

  it('keeps an explicit valid tab', () => {
    expect(parseSalesAnalysisTabId('wing-daily')).toBe('wing-daily');
    expect(parseSalesAnalysisTabId('rocket-daily')).toBe('overview');
    expect(SALES_ANALYSIS_TAB_IDS).not.toContain('rocket-daily');
  });
});
