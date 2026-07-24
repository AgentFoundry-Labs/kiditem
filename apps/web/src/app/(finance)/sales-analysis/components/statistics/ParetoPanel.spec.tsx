import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ParetoPanel } from './ParetoPanel';

describe('ParetoPanel', () => {
  it('presents revenue bands without product grade recommendations or mismatches', () => {
    render(
      <ParetoPanel
        pareto={{
          totalRevenue: 1_000,
          bandDistribution: { top70: 1, next20: 1, tail10: 1 },
          data: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              rank: 1,
              name: '상품 A',
              paretoBand: 'top70',
              revenue: 700,
              revenuePercent: 70,
              cumulativePercent: 70,
            },
          ],
        }}
        page={1}
        onPageChange={vi.fn()}
      />,
    );

    expect(screen.getAllByText('누적 70% 이하')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: '매출 구간' })).toBeInTheDocument();
    expect(screen.queryByText('현재등급')).not.toBeInTheDocument();
    expect(screen.queryByText('추천등급')).not.toBeInTheDocument();
    expect(screen.queryByText('등급 불일치')).not.toBeInTheDocument();
  });
});
