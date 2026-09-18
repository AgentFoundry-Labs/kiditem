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
  it('처음 대시보드의 두 줄을 매출 · 광고 두 장으로 세운다', () => {
    render(<DashboardHeadlineCards revenue={revenue} ads={ads} salesHref="/sales-analysis" />);
    const revenueCard = screen.getByRole('region', { name: '매출' });
    const adCard = screen.getByRole('region', { name: '광고' });
    expect(within(revenueCard).getAllByRole('term').map((node) => node.textContent))
      .toEqual(['월 매출', '월 순이익', '오늘 매출', '광고비율']);
    expect(within(adCard).getAllByRole('term').map((node) => node.textContent))
      .toEqual(['ROAS', '클릭률 (CTR)', '광고 전환매출', '광고비']);
  });

  it('모르는 값은 0 이 아니라 빈칸으로 둔다', () => {
    render(<DashboardHeadlineCards revenue={revenue} ads={ads} salesHref="/sales-analysis" />);
    expect(screen.getByTestId('headline-profit')).toHaveTextContent('—');
    expect(screen.getByTestId('headline-profit')).not.toHaveTextContent('0');
  });

  it('오르면 나쁜 지표는 오름을 붉게 칠한다', () => {
    render(<DashboardHeadlineCards revenue={revenue} ads={ads} salesHref="/sales-analysis" />);
    // 광고비율이 오르는 것은 나빠진 것이다. 매출이 오르는 것과 같은 초록이면 거꾸로 읽힌다.
    expect(within(screen.getByTestId('headline-adRate')).getByText('이전 12.0%')).toHaveClass('text-red-600');
    expect(within(screen.getByTestId('headline-revenue')).getByText('▲ 3.2% 이전 대비')).toHaveClass('text-emerald-700');
  });
});
