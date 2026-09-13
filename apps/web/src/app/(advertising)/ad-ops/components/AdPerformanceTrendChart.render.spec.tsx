/**
 * 성과 그래프의 쿠팡 광고센터 형식 계약을 고정한다.
 * - 좌/우축 지표 드롭다운 2개 + `닫기` 토글 + 다운로드 버튼
 * - 서버 trends 의 모든 날짜를 그리고, 측정하지 않은 날은 null 로 남긴다
 *
 * recharts 는 jsdom 에서 크기를 못 재 SVG 를 그리지 않으므로, 차트 본체
 * 대신 헤더 컨트롤과 출처 라벨, 내보내기 값을 검증한다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdMeasuredMetrics,
  AdTrendsData,
  AdTrendsDay,
} from '@kiditem/shared/advertising';
import { exportTrendXlsx } from '../lib/xlsx-export';
import AdPerformanceTrendChart from './AdPerformanceTrendChart';

vi.mock('../lib/xlsx-export', () => ({
  exportTrendXlsx: vi.fn().mockResolvedValue(undefined),
}));

function metrics(spend: number, revenue: number): AdMeasuredMetrics {
  return {
    spend,
    revenue,
    impressions: 100,
    clicks: 10,
    conversions: 1,
    ctr: 10,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) : null,
    cvr: 10,
  };
}

function buildTrends(daily: AdTrendsDay[]): AdTrendsData {
  const measured = daily.filter((day) => day.metrics !== null);
  return {
    knownThrough: '2026-07-18',
    from: daily[0]?.date ?? '2026-07-18',
    to: daily.at(-1)?.date ?? '2026-07-18',
    daily,
    summary: measured.length > 0
      ? {
          periodDayCount: measured.length,
          latestBusinessDate: measured.at(-1)!.date,
          observedAt: '2026-07-19T00:00:00.000Z',
          metrics: measured[0]!.metrics,
          orders: null,
        }
      : {
          periodDayCount: 0,
          latestBusinessDate: null,
          observedAt: null,
          metrics: null,
          orders: null,
        },
  };
}

const measuredDay: AdTrendsDay = {
  date: '2026-07-17',
  metrics: metrics(64_512, 368_890),
  orders: 12,
};

describe('AdPerformanceTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders both axis metric selects, the 닫기 toggle and a download control', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([measuredDay])} />);

    const left = screen.getByLabelText('좌측 축 지표') as HTMLSelectElement;
    const right = screen.getByLabelText('우측 축 지표') as HTMLSelectElement;

    expect(left.value).toBe('spend');
    expect(right.value).toBe('revenue');
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy();
    expect(screen.getByLabelText('성과 그래프 다운로드')).toBeTruthy();
  });

  it('lets each axis switch metric independently', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([measuredDay])} />);

    const right = screen.getByLabelText('우측 축 지표') as HTMLSelectElement;
    fireEvent.change(right, { target: { value: 'roas' } });

    expect(right.value).toBe('roas');
    expect((screen.getByLabelText('좌측 축 지표') as HTMLSelectElement).value).toBe('spend');
  });

  it('collapses the chart body when 닫기 is pressed', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([measuredDay])} />);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('button', { name: '열기' })).toBeTruthy();
  });

  it('labels the series from the measured summary', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([measuredDay])} />);

    expect(screen.getByText('쿠팡 광고 캠페인 합산 · 2026-07-17까지')).toBeTruthy();
  });

  it('keeps an unmeasured window on the chart and labels it 미수집', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends([
          { date: '2026-07-17', metrics: null, orders: null },
          { date: '2026-07-18', metrics: null, orders: null },
        ])}
      />,
    );

    expect(screen.getByText('미수집')).toBeTruthy();
    expect(screen.queryByText('표시할 광고 성과 데이터가 없습니다.')).toBeNull();
    expect(
      (screen.getByLabelText('성과 그래프 다운로드') as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('shows an empty state and disables download only when no date was requested', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([])} />);

    expect(screen.getByText('표시할 광고 성과 데이터가 없습니다.')).toBeTruthy();
    expect(
      (screen.getByLabelText('성과 그래프 다운로드') as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('sends the selected chart rows to the server export bridge', () => {
    render(<AdPerformanceTrendChart period="7d" trends={buildTrends([measuredDay])} />);

    fireEvent.click(screen.getByLabelText('성과 그래프 다운로드'));

    expect(exportTrendXlsx).toHaveBeenCalledWith({
      period: '7d',
      leftMetric: 'spend',
      rightMetric: 'revenue',
      leftLabel: '집행 광고비',
      rightLabel: '광고 전환 매출',
      points: [{
        businessDate: '2026-07-17',
        axisLabel: '07/17(금)',
        leftValue: 64_512,
        rightValue: 368_890,
      }],
    });
  });

  it('exports an unmeasured date as null, never zero', () => {
    render(
      <AdPerformanceTrendChart
        period="7d"
        trends={buildTrends([
          measuredDay,
          { date: '2026-07-18', metrics: null, orders: null },
        ])}
      />,
    );

    fireEvent.click(screen.getByLabelText('성과 그래프 다운로드'));

    expect(exportTrendXlsx).toHaveBeenLastCalledWith({
      period: '7d',
      leftMetric: 'spend',
      rightMetric: 'revenue',
      leftLabel: '집행 광고비',
      rightLabel: '광고 전환 매출',
      points: [
        {
          businessDate: '2026-07-17',
          axisLabel: '07/17(금)',
          leftValue: 64_512,
          rightValue: 368_890,
        },
        {
          businessDate: '2026-07-18',
          axisLabel: '07/18(토)',
          leftValue: null,
          rightValue: null,
        },
      ],
    });
  });
});
