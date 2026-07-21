/**
 * 성과 그래프의 쿠팡 광고센터 형식 계약을 고정한다.
 * - 좌/우축 지표 드롭다운 2개 + `닫기` 토글 + 다운로드 버튼
 * - listing 일별에 신호가 없으면 계정 일별로 폴백
 *
 * recharts 는 jsdom 에서 크기를 못 재 SVG 를 그리지 않으므로, 차트 본체
 * 대신 헤더 컨트롤과 시리즈 선택/폴백 판정을 검증한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AdTrendsData } from '@kiditem/shared/advertising';
import AdPerformanceTrendChart from './AdPerformanceTrendChart';

function metrics(spend: number, revenue: number) {
  return {
    spend,
    revenue,
    impressions: 100,
    clicks: 10,
    conversions: 1,
    ctr: 1.5,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) : 0,
    cvr: 2.5,
  };
}

function buildTrends(overrides: Partial<AdTrendsData> = {}): AdTrendsData {
  return {
    daily: [],
    firstHalf: metrics(0, 0),
    secondHalf: metrics(0, 0),
    gradeBudget: { A: 0, B: 0, C: 0 },
    accountDaily: [],
    accountSummary: null,
    ...overrides,
  } as AdTrendsData;
}

describe('AdPerformanceTrendChart', () => {
  it('renders both axis metric selects, the 닫기 toggle and a download control', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends({
          daily: [{ date: '2026-07-17', metrics: metrics(64_512, 368_890) }],
        })}
      />,
    );

    const left = screen.getByLabelText('좌측 축 지표') as HTMLSelectElement;
    const right = screen.getByLabelText('우측 축 지표') as HTMLSelectElement;

    expect(left.value).toBe('spend');
    expect(right.value).toBe('revenue');
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    expect(screen.getByLabelText('성과 그래프 다운로드')).toBeTruthy();
  });

  it('lets each axis switch metric independently', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends({
          daily: [{ date: '2026-07-17', metrics: metrics(64_512, 368_890) }],
        })}
      />,
    );

    const right = screen.getByLabelText('우측 축 지표') as HTMLSelectElement;
    fireEvent.change(right, { target: { value: 'roas' } });

    expect(right.value).toBe('roas');
    expect((screen.getByLabelText('좌측 축 지표') as HTMLSelectElement).value).toBe('spend');
  });

  it('collapses the chart body when 닫기 is pressed', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends({
          daily: [{ date: '2026-07-17', metrics: metrics(64_512, 368_890) }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('button', { name: '열기' })).toBeTruthy();
  });

  it('falls back to the account series when listing daily carries no signal', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends({
          daily: [{ date: '2026-07-17', metrics: metrics(0, 0) }],
          accountDaily: [
            { date: '2026-07-17', metrics: metrics(377_435, 2_339_290), orders: 12 },
          ],
        })}
      />,
    );

    expect(screen.getByText('쿠팡 광고센터 계정 일별')).toBeTruthy();
  });

  it('shows an empty state and disables download when there is nothing to plot', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends()} />);

    expect(screen.getByText('표시할 광고 성과 데이터가 없습니다.')).toBeTruthy();
    expect(
      (screen.getByLabelText('성과 그래프 다운로드') as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
