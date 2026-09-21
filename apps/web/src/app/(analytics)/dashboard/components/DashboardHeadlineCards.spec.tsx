import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHeadlineCards, type HeadlineMetric } from './DashboardHeadlineCards';

const revenue: HeadlineMetric[] = [
  { key: 'revenue', label: '월 매출', value: '135,385,452', unit: '원', note: '▲ 3.2% 이전 대비', trend: 'up' },
  { key: 'profit', label: '월 순이익', value: null, unit: '원' },
  { key: 'today', label: '오늘 매출', value: '0', unit: '원', note: '주문 0건' },
  { key: 'adRate', label: '광고비율', value: '16.4', unit: '%', note: '이전 12.0%', trend: 'up', higherIsWorse: true, alert: true },
];

const ads: HeadlineMetric[] = [
  { key: 'roas', label: 'ROAS', value: '412', unit: '%' },
  { key: 'ctr', label: '클릭률 (CTR)', value: '2.31', unit: '%' },
  { key: 'adConvRevenue', label: '광고 전환매출', value: '8,120,000', unit: '원' },
  { key: 'adSpend', label: '광고비', value: '1,970,000', unit: '원', higherIsWorse: true },
];

describe('DashboardHeadlineCards', () => {
  it('keeps the five-card inputs readable while preserving unknown values', () => {
    render(<DashboardHeadlineCards revenue={revenue} ads={ads} salesHref="/sales-analysis" />);

    expect(screen.getByRole('region', { name: '매출' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '마케팅' })).toBeInTheDocument();
    expect(screen.getByTestId('headline-profit')).toHaveTextContent('—');
    expect(screen.getByTestId('headline-profit')).not.toHaveTextContent('0');
  });

  it('marks an increasing higher-is-worse metric red', () => {
    render(<DashboardHeadlineCards revenue={[revenue[3]!]} ads={[revenue[0]!]} salesHref="/sales-analysis" />);

    expect(within(screen.getByTestId('headline-adRate')).getByText('이전 12.0%')).toHaveClass('text-red-600');
    expect(within(screen.getByTestId('headline-revenue')).getByText('▲ 3.2% 이전 대비')).toHaveClass('text-emerald-700');
  });
});
