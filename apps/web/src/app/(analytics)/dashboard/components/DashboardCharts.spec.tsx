import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('recharts', async () => {
  type MockProps = {
    children?: React.ReactNode;
    height?: string | number;
    initialDimension?: { width: number; height: number };
  };
  const ChartPart = ({ children }: MockProps) => <div>{children}</div>;
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
    Tooltip: ChartPart,
    CartesianGrid: ChartPart,
    AreaChart: ChartPart,
    Area: ChartPart,
    BarChart: ChartPart,
    Bar: ChartPart,
    Cell: ChartPart,
    ResponsiveContainer,
  };
});

import { DashboardCharts } from './DashboardCharts';

const trend = [
  {
    date: '2026-04-18',
    revenue: 120_000,
    profit: 0,
    adCost: 30_000,
    profitRate: 0,
    adRate: 25,
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
});
