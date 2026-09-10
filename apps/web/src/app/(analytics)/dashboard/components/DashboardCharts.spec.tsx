import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const chartCaptures = vi.hoisted(() => ({
  areaData: [] as unknown[],
  tooltipFormatters: [] as Array<(value: unknown, name: unknown) => unknown>,
}));

vi.mock('recharts', async () => {
  type MockProps = {
    children?: React.ReactNode;
    height?: string | number;
    initialDimension?: { width: number; height: number };
    data?: unknown;
    formatter?: (value: unknown, name: unknown) => unknown;
  };
  const ChartPart = ({ children }: MockProps) => <div>{children}</div>;
  const AreaChart = ({ children, data }: MockProps) => {
    chartCaptures.areaData.push(data);
    return <div>{children}</div>;
  };
  const Tooltip = ({ children, formatter }: MockProps) => {
    if (formatter) chartCaptures.tooltipFormatters.push(formatter);
    return <div>{children}</div>;
  };
  const ResponsiveContainer = ({ children, height, initialDimension }: MockProps) => (
    <div
      data-testid="responsive-container"
      data-height={height ?? ''}
      data-initial-width={initialDimension?.width ?? ''}
      data-initial-height={initialDimension?.height ?? ''}
    >
      {children}
    </div>
  );
  return {
    XAxis: ChartPart,
    YAxis: ChartPart,
    Tooltip,
    CartesianGrid: ChartPart,
    AreaChart,
    Area: ChartPart,
    BarChart: ChartPart,
    Bar: ChartPart,
    Cell: ChartPart,
    ResponsiveContainer,
  };
});

import { DashboardCharts, EvidenceTooltip } from './DashboardCharts';

beforeEach(() => {
  chartCaptures.areaData.length = 0;
  chartCaptures.tooltipFormatters.length = 0;
});

const trend = [
  {
    date: '2026-04-18',
    revenue: 120_000,
    profit: 0,
    adCost: 30_000,
    profitRate: 0,
    adRate: 25,
    evidence: { revenue: null, profit: null, adCost: null },
  },
];

const trendWithUnavailableGap = [
  {
    date: '2026-04-18',
    revenue: null,
    profit: null,
    adCost: null,
    profitRate: null,
    adRate: null,
    evidence: { revenue: null, profit: null, adCost: null },
  },
  {
    date: '2026-04-19',
    revenue: 0,
    profit: 0,
    adCost: 0,
    profitRate: 0,
    adRate: 0,
    evidence: { revenue: null, profit: null, adCost: null },
  },
];

function expectPositiveInitialDimension() {
  const containers = screen.getAllByTestId('responsive-container');
  expect(containers.length).toBeGreaterThan(0);
  for (const container of containers) {
    expect(Number(container.dataset.initialWidth)).toBeGreaterThan(0);
    expect(Number(container.dataset.initialHeight)).toBeGreaterThan(0);
    expect(Number(container.dataset.height)).toBeGreaterThan(0);
  }
}

describe('DashboardCharts', () => {
  it('gives revenue chart ResponsiveContainer a positive initial dimension', () => {
    render(
      <DashboardCharts
        chartTab="revenue"
        dailyTrend={trend}
        adChartData={trend}
        benchmarkData={null}
        hasTrend
      />,
    );

    expectPositiveInitialDimension();
  });

  it('gives ad chart ResponsiveContainer a positive initial dimension', () => {
    render(
      <DashboardCharts
        chartTab="ad"
        dailyTrend={trend}
        adChartData={trend}
        benchmarkData={null}
        hasTrend
      />,
    );

    expectPositiveInitialDimension();
  });

  it('gives benchmark chart ResponsiveContainer a positive initial dimension', () => {
    render(
      <DashboardCharts
        chartTab="benchmark"
        dailyTrend={trend}
        adChartData={trend}
        benchmarkData={[
          { name: '광고비율', my: 12.6, avg: 10, unit: '%', invertGood: true },
        ]}
        hasTrend
      />,
    );

    expectPositiveInitialDimension();
  });

  it('keeps nullable gaps and explicit zeroes in both chart datasets', () => {
    render(
      <DashboardCharts
        chartTab="revenue"
        dailyTrend={trendWithUnavailableGap}
        adChartData={trendWithUnavailableGap}
        benchmarkData={null}
        hasTrend
      />,
    );

    expect(chartCaptures.areaData).toEqual([trendWithUnavailableGap]);
    expect(chartCaptures.tooltipFormatters[0]?.(null, 'profitRate')).toEqual(['—', '이익률']);
    expect(chartCaptures.tooltipFormatters[0]?.(0, 'profitRate')).toEqual(['0.0%', '이익률']);
  });

  it('renders unavailable ad values as dashes without changing explicit zeroes', () => {
    render(
      <DashboardCharts
        chartTab="ad"
        dailyTrend={trendWithUnavailableGap}
        adChartData={trendWithUnavailableGap}
        benchmarkData={null}
        hasTrend
      />,
    );

    expect(chartCaptures.areaData).toEqual([trendWithUnavailableGap]);
    expect(chartCaptures.tooltipFormatters[0]?.(null, 'adCost')).toEqual(['—', '광고비']);
    expect(chartCaptures.tooltipFormatters[0]?.(0, 'adCost')).toEqual(['₩0', '광고비']);
  });

  it('shows actual tooltip values with units alongside their evidence', () => {
    render(
      <EvidenceTooltip
        active
        payload={[{
          dataKey: 'revenue',
          value: 120_000,
          payload: trend[0],
        }, {
          dataKey: 'profitRate',
          value: 0,
          payload: trend[0],
        }]}
      />,
    );

    expect(screen.getByText('매출 · ₩120,000')).toBeInTheDocument();
    expect(screen.getByText('이익률 · 0.0%')).toBeInTheDocument();
    expect(screen.getByText(/매출 근거 · 근거 정보 없음/)).toBeInTheDocument();
  });

  it('keeps a measured value neutral when the benchmark average is unavailable', () => {
    render(
      <DashboardCharts
        chartTab="benchmark"
        dailyTrend={trend}
        adChartData={trend}
        benchmarkData={[{
          name: '광고비율',
          my: 12.6,
          avg: null,
          unit: '%',
          invertGood: true,
        }]}
        hasTrend
      />,
    );

    expect(screen.getByText('12.6%')).toHaveClass('text-slate-700');
    expect(screen.getByText('비교 기준 없음')).toBeInTheDocument();
  });
});
