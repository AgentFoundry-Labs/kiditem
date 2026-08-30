import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationRun } from '@kiditem/shared/operations';
import { ProductOperationsDataStatusAction } from './ProductOperationsDataStatusAction';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  startRefresh: vi.fn(),
  cancelRun: vi.fn(),
  activeRun: null as OperationRun | null,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    mutationFn: () => Promise<unknown>;
    onSuccess: () => Promise<void>;
  }) => ({
    isPending: false,
    mutate: () => void options.mutationFn().then(options.onSuccess),
  }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/lib/manual-operation-actions', () => ({
  startProductProfitabilityRefreshAction: mocks.startRefresh,
}));

vi.mock('@/hooks/useOperationRun', () => ({
  useCancelOperationRun: () => ({ mutateAsync: mocks.cancelRun, isPending: false }),
}));

vi.mock('../hooks/useProductOperationsDataStatus', () => ({
  useProductOperationsDataStatus: () => ({
    data: {
      displayDataAsOf: '2026-08-02',
      lastCompletedRefreshAt: null,
      activeRun: mocks.activeRun,
      sources: {
        traffic: source('CURRENT'),
        advertising: source('CURRENT'),
        sellpiaProfit: source('CURRENT'),
        abc: source('CURRENT'),
      },
      abcSummary: {
        classifiedProductCount: 1,
        unclassifiedProductCount: 0,
        mappingRequiredProductCount: 0,
        orderEvidenceRequiredProductCount: 0,
        otherPendingProductCount: 0,
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

describe('ProductOperationsDataStatusAction', () => {
  beforeEach(() => {
    mocks.activeRun = null;
    mocks.invalidateQueries.mockReset();
    mocks.startRefresh.mockReset();
    mocks.cancelRun.mockReset();
  });

  it('labels the data status entry point as a refresh action', () => {
    render(
      <ProductOperationsDataStatusAction
        open={false}
        onOpenChange={vi.fn()}
        periodDays={30}
      />,
    );

    expect(screen.getByRole('button', { name: '데이터 갱신' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /데이터 기준/ })).not.toBeInTheDocument();
  });

  it('closes the status dialog after the profitability refresh has started', async () => {
    mocks.startRefresh.mockResolvedValue({ id: 'operation-1' });
    const onOpenChange = vi.fn();

    render(
      <ProductOperationsDataStatusAction
        open
        onOpenChange={onOpenChange}
        periodDays={30}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '수익성 데이터 갱신' }));

    await waitFor(() => {
      expect(mocks.startRefresh).toHaveBeenCalledWith({ sourceSurface: 'domain_screen' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('cancels the active profitability parent run from the status dialog', async () => {
    mocks.activeRun = operationRun('running');
    mocks.cancelRun.mockResolvedValue(operationRun('cancelled'));

    render(
      <ProductOperationsDataStatusAction
        open
        onOpenChange={vi.fn()}
        periodDays={30}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '수익성 데이터 갱신 중단' }));
    fireEvent.click(screen.getByRole('button', { name: '중단' }));

    await waitFor(() => {
      expect(mocks.cancelRun).toHaveBeenCalledWith(mocks.activeRun?.id);
    });
  });
});

function source(status: 'CURRENT') {
  return {
    status,
    coverageEndDate: '2026-08-02',
    capturedAt: '2026-08-03T00:00:00.000Z',
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
    progress: null,
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
    finishedAt: status === 'cancelled' ? '2026-08-02T00:01:00.000Z' : null,
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
