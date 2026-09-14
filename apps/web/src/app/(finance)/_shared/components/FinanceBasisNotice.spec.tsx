import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildPeriodBasis } from '@kiditem/shared/dashboard';
import type { FinanceCostInputsBasis } from '@kiditem/shared/finance';
import { FinanceBasisNotice } from './FinanceBasisNotice';

const complete = buildPeriodBasis({
  from: '2026-04-01',
  to: '2026-04-30',
  includedDates: Array.from({ length: 30 }, (_, index) => `2026-04-${String(index + 1).padStart(2, '0')}`),
  sources: ['orders'],
});

const component = (lines: number, notAppliedLines: number, unmeasuredLines: number) =>
  ({ lines, notAppliedLines, unmeasuredLines });

const WITHHELD = '그 상품의 순이익과 합계 순이익은 계산하지 않았습니다.';

function renderCostInputs(costInputs: FinanceCostInputsBasis) {
  return render(
    <FinanceBasisNotice
      basis={{
        requestedWindow: { from: '2026-04-01', to: '2026-04-30' },
        revenue: complete,
        adCost: complete,
        profit: complete,
        costInputs,
      }}
    />,
  );
}

describe('FinanceBasisNotice cost inputs (KID-114)', () => {
  it('words each component by its shared evidence state, scoped to the lines and totals', () => {
    renderCostInputs({
      unmappedLines: 0,
      purchaseCost: component(3, 0, 1),
      commission: component(3, 2, 1),
      otherCost: component(3, 2, 1),
      advertising: component(3, 3, 0),
    });

    expect(screen.getByText('판매수수료가 적용되지 않는 주문 라인 2건은 0원으로 계산했습니다.')).toBeInTheDocument();
    expect(screen.getByText('기타비용이 적용되지 않는 주문 라인 2건은 0원으로 계산했습니다.')).toBeInTheDocument();
    // Not applied to any line of the window: the whole component is 0 by rule.
    expect(screen.getByText('광고가 적용되지 않아 주문 라인 3건 모두 광고비 0원으로 계산했습니다.')).toBeInTheDocument();
    expect(screen.getByText(`판매수수료 원천이 없는 주문 라인 1건 — ${WITHHELD}`)).toBeInTheDocument();
    expect(screen.getByText(`기타비용 원천이 없는 주문 라인 1건 — ${WITHHELD}`)).toBeInTheDocument();
    expect(screen.getByText(`매입가가 없는 주문 라인 1건 — ${WITHHELD}`)).toBeInTheDocument();
    // The old notice claimed no profit was calculated at all while measured rows showed one.
    expect(screen.queryByText(/순이익을 계산하지 않았습니다\.$/)).not.toBeInTheDocument();
  });

  it('names lines sold under no listing option apart from lines whose purchase price is missing', () => {
    renderCostInputs({
      unmappedLines: 2,
      purchaseCost: component(1, 0, 1),
      commission: component(1, 1, 0),
      otherCost: component(1, 1, 0),
      advertising: component(1, 1, 0),
    });

    expect(screen.getByText(`매입가가 없는 주문 라인 1건 — ${WITHHELD}`)).toBeInTheDocument();
    expect(screen.getByText(
      '상품 옵션에 연결되지 않은 주문 라인 2건 — 상품 행이 없어 매출 합계에만 포함했고, 합계 순이익은 계산하지 않았습니다.',
    )).toBeInTheDocument();
    // Lines with no product row are not claimed to lack a purchase price.
    expect(screen.queryByText(`매입가가 없는 주문 라인 3건 — ${WITHHELD}`)).not.toBeInTheDocument();
  });

  it('says nothing about cost inputs of a window with no line, or whose every line was measured', () => {
    const measured = renderCostInputs({
      unmappedLines: 0,
      purchaseCost: component(2, 0, 0),
      commission: component(2, 0, 0),
      otherCost: component(2, 0, 0),
      advertising: component(2, 0, 0),
    });
    expect(measured.container).toBeEmptyDOMElement();
    measured.unmount();

    const empty = renderCostInputs({
      unmappedLines: 0,
      purchaseCost: component(0, 0, 0),
      commission: component(0, 0, 0),
      otherCost: component(0, 0, 0),
      advertising: component(0, 0, 0),
    });
    expect(empty.container).toBeEmptyDOMElement();
  });
});
