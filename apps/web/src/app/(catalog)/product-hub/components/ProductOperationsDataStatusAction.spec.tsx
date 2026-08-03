import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductOperationsDataStatusAction } from './ProductOperationsDataStatusAction';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  startRefresh: vi.fn(),
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

vi.mock('../hooks/useProductOperationsDataStatus', () => ({
  useProductOperationsDataStatus: () => ({
    data: {
      displayDataAsOf: '2026-08-02',
      lastCompletedRefreshAt: null,
      activeRun: null,
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
});

function source(status: 'CURRENT') {
  return {
    status,
    coverageEndDate: '2026-08-02',
    capturedAt: '2026-08-03T00:00:00.000Z',
    lastErrorAt: null,
  } as const;
}
