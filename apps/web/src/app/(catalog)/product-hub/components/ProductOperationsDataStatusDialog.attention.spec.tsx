import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

describe('ProductOperationsDataStatusDialog attention state', () => {
  it('tells the operator to log into Coupang instead of showing a generic failure', () => {
    const current = {
      status: 'CURRENT' as const,
      coverageEndDate: '2026-08-02',
      capturedAt: '2026-08-03T01:00:00.000Z',
      lastErrorAt: null,
    };

    render(<ProductOperationsDataStatusDialog
      open
      onOpenChange={() => {}}
      loading={false}
      error={false}
      refreshing={false}
      onRefresh={() => {}}
      data={{
        displayDataAsOf: '2026-08-02',
        lastCompletedRefreshAt: null,
        activeRun: null,
        sources: {
          traffic: current,
          advertising: {
            status: 'ACTION_REQUIRED',
            coverageEndDate: null,
            capturedAt: null,
            lastErrorAt: null,
            attentionReason: 'marketplace_login',
          },
          sellpiaProfit: current,
          abc: current,
        },
        abcSummary: {
          classifiedProductCount: 0,
          unclassifiedProductCount: 1,
          mappingRequiredProductCount: 0,
          orderEvidenceRequiredProductCount: 0,
          otherPendingProductCount: 1,
        },
      }}
    />);

    expect(screen.getByText('로그인 필요')).toBeInTheDocument();
    expect(screen.getByText('쿠팡 광고센터에 로그인한 뒤 수익성 데이터를 다시 갱신해 주세요.')).toBeInTheDocument();
  });
});
