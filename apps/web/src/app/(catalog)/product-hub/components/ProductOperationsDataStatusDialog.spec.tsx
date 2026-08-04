import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

describe('ProductOperationsDataStatusDialog', () => {
  it('keeps source freshness in one modal and exposes the single profitability refresh action', () => {
    const onRefresh = vi.fn();
    render(<ProductOperationsDataStatusDialog
      open
      onOpenChange={() => {}}
      loading={false}
      error={false}
      refreshing={false}
      onRefresh={onRefresh}
      data={{
        displayDataAsOf: '2026-08-01',
        lastCompletedRefreshAt: '2026-08-02T00:00:00.000Z',
        activeRun: null,
        sources: {
          traffic: source('CURRENT'),
          advertising: source('OUTDATED'),
          sellpiaProfit: source('CURRENT'),
          abc: source('CURRENT'),
        },
        abcSummary: {
          classifiedProductCount: 7,
          unclassifiedProductCount: 3,
          mappingRequiredProductCount: 1,
          orderEvidenceRequiredProductCount: 1,
          otherPendingProductCount: 1,
        },
      }}
    />);

    expect(screen.getByRole('dialog', { name: '상품 운영 데이터 현황' })).toBeInTheDocument();
    for (const label of ['판매 지표', '광고비', '상품별 이익', 'ABC 등급']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('매핑 확인 필요')).toBeInTheDocument();
    expect(screen.queryByText('주문 근거 필요')).not.toBeInTheDocument();
    expect(screen.queryByText('주문 수집 확인')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수익성 데이터 갱신' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

function source(status: 'CURRENT' | 'OUTDATED') {
  return {
    status,
    coverageEndDate: '2026-08-01',
    capturedAt: '2026-08-02T00:00:00.000Z',
    lastErrorAt: null,
  } as const;
}
