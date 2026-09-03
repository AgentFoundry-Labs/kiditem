import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductOperationsDataStatus } from '@kiditem/shared/product-operations';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

describe('ProductOperationsDataStatusDialog', () => {
  it('shows live source readiness and exposes one explicit ABC recalculation action', () => {
    const onRefresh = vi.fn();
    renderDialog(readyStatus(), { onRefresh });

    expect(screen.getByRole('dialog', { name: '상품 운영 데이터 현황' })).toBeInTheDocument();
    for (const label of ['판매 지표', '광고비', 'Sellpia 이익', '상품 매핑']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /중단/ })).not.toBeInTheDocument();
  });

  it('keeps the official publication visible while labeling stale live data and both cutoffs', () => {
    const data = readyStatus();
    data.sources.sellpia.status = 'STALE';
    data.sources.sellpia.actualCutoff = '2026-08-31';
    data.actualCutoff = '2026-08-31';

    renderDialog(data);

    expect(screen.getByText('공식 등급 기준일 2026-07-31')).toBeInTheDocument();
    expect(screen.getByText('표시 데이터 기준일 2026-08-31')).toBeInTheDocument();
    expect(screen.getByText(/기존 공식 등급은 유지됩니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등급 새로고침' })).toBeDisabled();
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
      traffic: source('READY'),
      advertising: source('READY'),
      sellpia: source('READY'),
      mapping: { status: 'READY', generation: '7' },
    },
    abcSummary: {
      classifiedProductCount: 7,
      unclassifiedProductCount: 3,
      mappingRequiredProductCount: 0,
      otherPendingProductCount: 3,
    },
  };
}

function source(status: 'READY' | 'STALE' | 'MISSING') {
  return {
    status,
    actualCutoff: status === 'MISSING' ? null : '2026-08-31',
    capturedAt: status === 'MISSING' ? null : '2026-09-01T00:00:00.000Z',
    latestAttemptState: status === 'MISSING' ? null : 'COMPLETE' as const,
    errorCode: null,
  };
}
