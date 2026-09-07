import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { OperationRun } from '@kiditem/shared/operations';
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
      cancelling={false}
      onRefresh={onRefresh}
      onCancel={vi.fn().mockResolvedValue(undefined)}
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

  it('offers a confirmed cancellation action for the active profitability run', async () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    render(<ProductOperationsDataStatusDialog
      open
      onOpenChange={() => {}}
      loading={false}
      error={false}
      refreshing={false}
      cancelling={false}
      onRefresh={vi.fn()}
      onCancel={onCancel}
      data={{
        displayDataAsOf: '2026-08-01',
        lastCompletedRefreshAt: null,
        activeRun: operationRun('running'),
        sources: {
          traffic: source('CURRENT'),
          advertising: source('UPDATING'),
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

    fireEvent.click(screen.getByRole('button', { name: '수익성 데이터 갱신 중단' }));
    expect(screen.getByRole('dialog', { name: '수익성 데이터 갱신을 중단할까요?' }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

function source(status: 'CURRENT' | 'OUTDATED' | 'UPDATING') {
  return {
    status,
    coverageEndDate: '2026-08-01',
    capturedAt: '2026-08-02T00:00:00.000Z',
    lastErrorAt: null,
  } as const;
}

function operationRun(status: OperationRun['status']): OperationRun {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    operationKey: 'products.refresh_profitability_evidence',
    definitionVersion: 1,
    title: '수익성 데이터 갱신',
    ownerDomain: 'products',
    engineType: 'composite',
    resourceClass: 'default',
    executionTimeoutMs: 900_000,
    status,
    triggerSource: 'domain_screen',
    parentRunId: null,
    scheduleId: null,
    nativeRunType: null,
    nativeRunId: null,
    progress: 0.5,
    stage: null,
    stageUpdatedAt: null,
    progressCurrent: null,
    progressTotal: null,
    deadlineAt: null,
    result: null,
    error: null,
    requestedBy: null,
    scheduledFor: null,
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: null,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
