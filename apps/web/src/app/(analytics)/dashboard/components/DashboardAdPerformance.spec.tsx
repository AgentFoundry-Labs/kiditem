import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardAdPerformance } from './DashboardAdPerformance';

const basis = {
  kind: 'period' as const,
  from: '2026-08-01',
  to: '2026-08-01',
  targetDays: 1,
  includedDates: ['2026-08-01'],
  invalidDates: [],
  sources: ['coupang_ads'],
};

function renderSourceLine(source: string | null, effectiveAdSource: string | null) {
  render(
    <DashboardAdPerformance
      rangeLabel="이번 달"
      source={source}
      knownThrough="2026-08-01"
      effectiveAdSource={effectiveAdSource}
      rows={[{ key: 'revenue', label: '광고전환매출', display: '20원', basis }]}
    />,
  );
  return screen.getByTestId('ad-performance-source');
}

describe('DashboardAdPerformance', () => {
  it('shows the selected range, source, cutoff, and each row basis', () => {
    render(
      <DashboardAdPerformance
        rangeLabel="2026-08-01 ~ 2026-08-01"
        source="coupang_ads"
        knownThrough="2026-08-01"
        effectiveAdSource="coupang_ads"
        rows={[
          { key: 'revenue', label: '광고전환매출', display: '20원', basis },
          { key: 'views', label: '노출', display: '100회', basis },
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: /광고 성과/ })).toHaveTextContent(
      '2026-08-01 ~ 2026-08-01',
    );
    expect(screen.getByTestId('ad-performance-source').textContent).toBe('쿠팡 광고 · 2026-08-01까지');
    fireEvent.click(screen.getByRole('button', { name: '광고 성과 근거 안내' }));
    expect(screen.getAllByText('광고전환매출')).toHaveLength(3);
    expect(screen.getAllByText('노출')).toHaveLength(3);
  });

  /**
   * The line used to end in the wire enum — the live dashboard read
   * `미수집 · 2026-09-13까지 · 기준 none`. The effective source is said only
   * when it adds a fact, and then in the operator's words.
   */
  it.each([
    { reason: 'an absent effective source', source: 'unavailable', effective: 'none', line: '미수집 · 2026-08-01까지' },
    { reason: 'an unpublished effective source', source: 'coupang_ads', effective: null, line: '쿠팡 광고 · 2026-08-01까지' },
    { reason: 'the source the line already names', source: 'coupang_ads', effective: 'coupang_ads', line: '쿠팡 광고 · 2026-08-01까지' },
  ])('leaves out $reason', ({ source, effective, line }) => {
    expect(renderSourceLine(source, effective).textContent).toBe(line);
  });

  it.each([
    { reason: 'a differing effective source', source: 'coupang_ads', effective: 'wing', line: '쿠팡 광고 · 2026-08-01까지 · 기준 Wing' },
    { reason: 'an effective source the line does not name', source: 'unavailable', effective: 'coupang_ads', line: '미수집 · 2026-08-01까지 · 기준 쿠팡 광고' },
    { reason: 'a mixed effective period', source: 'coupang_ads', effective: 'mixed', line: '쿠팡 광고 · 2026-08-01까지 · 기준 혼합' },
  ])('names $reason in Korean', ({ source, effective, line }) => {
    expect(renderSourceLine(source, effective).textContent).toBe(line);
  });
});
