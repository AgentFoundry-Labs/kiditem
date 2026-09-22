import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DashboardRevenue } from './DashboardRevenue';
import type { SellpiaSalesGroup, SellpiaSalesSummary } from '@kiditem/shared/dashboard';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  ComposedChart: ({ data }: { data: unknown }) => <pre data-testid="revenue-plot">{JSON.stringify(data)}</pre>,
  Bar: () => null,
  CartesianGrid: () => null,
  Line: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

const empty: SellpiaSalesGroup = { revenue: 0, cost: 0, qty: 0, revenueShare: 0, malls: [], daily: [] };
/** 잰 날은 이틀뿐이고 그중 하루는 확인된 0 원이다 — 빈칸과 0 은 다른 말이다. */
const sold: SellpiaSalesGroup = {
  revenue: 10, cost: 0, qty: 1, revenueShare: 100, malls: [],
  daily: [
    { date: '2026-09-02', revenue: 10, qty: 1, revenueShare: 100 },
    { date: '2026-09-04', revenue: 0, qty: 0, revenueShare: 0 },
  ],
};

const summary: SellpiaSalesSummary = {
  knownThrough: '2026-09-05',
  range: { from: '2026-09-01', to: '2026-09-05' },
  rocket: sold,
  others: empty,
  // 쿠팡 자르기는 서버가 판매처로 나눠 보낸다. 화면은 총 매출을 쿠팡+쿠팡 외로 만들지 않는다.
  total: sold,
  coupang: sold,
  nonCoupang: empty,
  totalRevenue: 10, totalCost: 0, adCost: null, netProfit: null, profitRate: null,
  lastCapturedAt: null, hasData: true,
};

function plottedPoints() {
  return JSON.parse(screen.getByTestId('revenue-plot').textContent!);
}

beforeEach(() => localStorage.clear());

describe('Dashboard revenue measured dates', () => {
  it('keeps the whole selected axis, blanks missing dates, and preserves measured zero', () => {
    render(<DashboardRevenue summary={summary} isLoading={false} isError={false} salesHref="/sales-analysis" />);
    expect(plottedPoints()).toEqual([
      { date: '2026-09-01' },
      { date: '2026-09-02', total: 10, coupang: 10 },
      { date: '2026-09-03' },
      { date: '2026-09-04', total: 0, coupang: 0 },
      { date: '2026-09-05' },
    ]);
    // 기본은 총 매출 · 쿠팡 · 쿠팡 외 몰 세 선이다(사장님 2026-09-18).
    expect(screen.getByText('총 매출')).toBeInTheDocument();
    expect(screen.getByText('쿠팡')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 외 몰')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByRole('radio', { name: '누적' }));
    expect(plottedPoints()).toEqual([
      { date: '2026-09-01' },
      { date: '2026-09-02', total: 10, coupang: 10 },
      { date: '2026-09-03' },
      { date: '2026-09-04', total: 10, coupang: 10 },
      { date: '2026-09-05' },
    ]);
  });

  it('draws nothing when the server sent no Coupang cut, rather than reading it as no sales', () => {
    // 옛 응답에는 이 세 묶음이 없다. 그때는 선을 그릴 근거가 없다고 말한다.
    const { total: _total, coupang: _coupang, nonCoupang: _nonCoupang, ...legacy } = summary;
    render(<DashboardRevenue summary={legacy} isLoading={false} isError={false} salesHref="/sales-analysis" />);

    expect(screen.queryByTestId('revenue-plot')).not.toBeInTheDocument();
    expect(screen.getByText('이 기간의 셀피아 판매현황이 아직 없습니다.')).toBeInTheDocument();
  });
});
