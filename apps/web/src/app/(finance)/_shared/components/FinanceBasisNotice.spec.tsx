import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
import { FinanceBasisNotice } from './FinanceBasisNotice';

const complete = buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: Array.from({ length: 30 }, (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
  sources: ['orders'],
});

const component = (lines: number, notAppliedLines: number, unmeasuredLines: number) =>
  ({ lines, notAppliedLines, unmeasuredLines });

describe('FinanceBasisNotice cost inputs (KID-114)', () => {
  it('says which lines carry a cost that does not apply, and which have no source, scoped to the lines and totals', () => {
    render(
      <FinanceBasisNotice
        basis={{
          requestedWindow: { from: '2026-04-01', to: '2026-04-30' },
          revenue: complete,
          adCost: complete,
          profit: complete,
          costInputs: {
            purchaseCost: component(3, 0, 1),
            commission: component(3, 2, 1),
            otherCost: component(3, 2, 1),
            advertising: component(3, 3, 0),
          },
        }}
      />,
    );

    expect(screen.getByText('판매수수료가 적용되지 않는 주문 라인 2건은 0원으로 계산했습니다.')).toBeInTheDocument();
    expect(screen.getByText('기타비용이 적용되지 않는 주문 라인 2건은 0원으로 계산했습니다.')).toBeInTheDocument();
    expect(screen.getByText('광고가 적용되지 않는 주문 라인 3건은 광고비 0원으로 계산했습니다.')).toBeInTheDocument();
    expect(screen.getByText('판매수수료 원천이 없는 주문 라인 1건 — 그 상품의 순이익과 합계 순이익은 계산하지 않았습니다.')).toBeInTheDocument();
    expect(screen.getByText('기타비용 원천이 없는 주문 라인 1건 — 그 상품의 순이익과 합계 순이익은 계산하지 않았습니다.')).toBeInTheDocument();
    expect(screen.getByText('매입가가 없는 주문 라인 1건 — 그 상품의 순이익과 합계 순이익은 계산하지 않았습니다.')).toBeInTheDocument();
    // The old notice claimed no profit was calculated at all while measured rows showed one.
    expect(screen.queryByText(/순이익을 계산하지 않았습니다\.$/)).not.toBeInTheDocument();
  });

  it('says nothing about cost inputs that every line measured', () => {
    const { container } = render(
      <FinanceBasisNotice
        basis={{
          revenue: complete,
          adCost: complete,
          profit: complete,
          costInputs: {
            purchaseCost: component(2, 0, 0),
            commission: component(2, 0, 0),
            otherCost: component(2, 0, 0),
            advertising: component(2, 0, 0),
          },
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
