import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductOperationsDataStatus } from '@kiditem/shared/product-operations';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

describe('ProductOperationsDataStatusDialog', () => {
  it('shows live source readiness and exposes one explicit ABC recalculation action', () => {
    const onRefresh = vi.fn();
    renderDialog(readyStatus(), { onRefresh });

    expect(screen.getByRole('dialog', { name: '상품 운영 데이터 현황' })).toBeInTheDocument();
    for (const label of ['방문·조회', '주문·판매·매출', '광고비', 'Sellpia 이익', '상품 매핑']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /중단/ })).not.toBeInTheDocument();
  });

  it('shows uncollected Orders separately from complete traffic without blocking independent ABC publication', () => {
    const data = readyStatus();
    data.sources.orders = source(false, false);
    data.displayDataAsOf = null;
    renderDialog(data);

    const orderRow = screen.getByText('주문·판매·매출').parentElement!;
    const trafficRow = screen.getByText('방문·조회').parentElement!;
    expect(within(orderRow).getByText('미수집')).toBeInTheDocument();
    expect(within(trafficRow).getByText('최신')).toBeInTheDocument();
    expect(screen.getByText('화면 전체 기준일 없음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등급 새로고침' })).toBeEnabled();
  });

  it('labels stale live data and both cutoffs, and still offers the grade refresh', () => {
    const data = readyStatus();
    data.sources.sellpia.ready = false;
    data.sources.sellpia.actualCutoff = '2026-08-31';
    data.actualCutoff = '2026-08-31';

    renderDialog(data);

    expect(screen.getByText('공식 등급 기준일 2026-07-31')).toBeInTheDocument();
    expect(screen.getByText('표시 데이터 기준일 2026-08-31')).toBeInTheDocument();
    expect(screen.getByText('갱신 필요')).toBeInTheDocument();
    expect(screen.getByText(
      '필수 원천이 최신이 아니면 셀피아 상품 손익과 광고 손익이 함께 도달한 날짜까지만 발행합니다. 그런 날짜가 없으면 기존 공식 등급을 유지합니다.',
    )).toBeInTheDocument();
    // The server publishes the newest pair that ends together, as the dashboard's refresh does.
    expect(screen.getByRole('button', { name: '등급 새로고침' })).toBeEnabled();
  });

  it('renders the command outcome as an inline message without dismissing the dialog', () => {
    renderDialog(readyStatus(), {
      feedback: {
        tone: 'warning',
        message: '원천이 준비되지 않아 기존 공식 등급을 유지합니다.',
      },
    });

    expect(screen.getByText('원천이 준비되지 않아 기존 공식 등급을 유지합니다.'))
      .toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '상품 운영 데이터 현황' }))
      .toBeInTheDocument();
  });
});

function renderDialog(
  data: ProductOperationsDataStatus,
  overrides: Partial<React.ComponentProps<typeof ProductOperationsDataStatusDialog>> = {},
) {
  return render(
    <ProductOperationsDataStatusDialog
      open
      onOpenChange={() => {}}
      loading={false}
      error={false}
      refreshing={false}
      checking={false}
      onRefresh={vi.fn()}
      data={data}
      {...overrides}
    />,
  );
}

function readyStatus(): ProductOperationsDataStatus {
  return {
    displayDataAsOf: '2026-08-31',
    formulaRevision: 2,
    publicationRevision: 4,
    officialCutoff: '2026-07-31',
    publishedAt: '2026-08-01T00:00:00.000Z',
    actualCutoff: '2026-08-31',
    sources: {
      traffic: source(true),
      orders: source(true),
      advertising: source(true),
      sellpia: source(true),
      mapping: { ready: true, generation: '7' },
    },
    abcSummary: {
      classifiedProductCount: 7,
      unclassifiedProductCount: 3,
      mappingRequiredProductCount: 0,
      otherPendingProductCount: 3,
    },
  };
}

/** `collected: false` is the never-collected source: not ready and no cutoff to show. */
function source(ready: boolean, collected = true) {
  return {
    ready,
    requiredCutoff: '2026-08-31',
    actualCutoff: collected ? '2026-08-31' : null,
    latestAttempt: collected ? { state: 'COMPLETE' as const } : null,
    latestComplete: collected ? { actualCutoff: '2026-08-31' } : null,
  };
}
