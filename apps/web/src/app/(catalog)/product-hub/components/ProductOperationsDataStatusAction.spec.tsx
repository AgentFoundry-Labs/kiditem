import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-error';
import { ProductOperationsDataStatusAction } from './ProductOperationsDataStatusAction';

const mocks = vi.hoisted(() => ({
  recalculateProductAbc: vi.fn(),
  refetchProducts: vi.fn(),
  refetchQueries: vi.fn(),
  mutationOptions: null as null | {
    mutationFn: () => Promise<unknown>;
    onSuccess?: (result: unknown) => Promise<void> | void;
    onError?: (error: unknown) => Promise<void> | void;
    retry?: boolean;
  },
  statusData: null as unknown as ReturnType<typeof readyStatus>,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: NonNullable<typeof mocks.mutationOptions>) => {
    mocks.mutationOptions = options;
    return {
      isPending: false,
      mutate: () => {
        void options.mutationFn()
          .then((result) => options.onSuccess?.(result))
          .catch((error) => options.onError?.(error));
      },
    };
  },
  useQueryClient: () => ({ refetchQueries: mocks.refetchQueries }),
}));

vi.mock('@/lib/product-abc-api', () => ({
  recalculateProductAbc: mocks.recalculateProductAbc,
}));

vi.mock('../hooks/useProductOperationsDataStatus', () => ({
  useProductOperationsDataStatus: () => ({
    data: mocks.statusData,
    isLoading: false,
    isError: false,
  }),
}));

describe('ProductOperationsDataStatusAction', () => {
  beforeEach(() => {
    mocks.statusData = readyStatus();
    mocks.recalculateProductAbc.mockReset();
    mocks.refetchProducts.mockReset();
    mocks.refetchQueries.mockReset();
    mocks.refetchProducts.mockResolvedValue(undefined);
    mocks.refetchQueries.mockResolvedValue(undefined);
    mocks.mutationOptions = null;
  });

  it('is the only Product Hub action that explicitly recalculates ABC and refetches its reads', async () => {
    mocks.recalculateProductAbc.mockResolvedValue({
      outcome: 'PUBLISHED',
      publicationRevision: 5,
      formulaRevision: 2,
      officialCutoff: '2026-08-31',
      classifiedProductCount: 7,
      unclassifiedProductCount: 2,
      changedProductCount: 3,
    });

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));

    await waitFor(() => {
      expect(mocks.recalculateProductAbc).toHaveBeenCalledTimes(1);
      expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
      expect(mocks.refetchQueries).toHaveBeenCalledTimes(2);
    });
    expect(mocks.mutationOptions?.retry).toBe(false);
  });

  it.each([
    ['sellpia', () => { mocks.statusData.sources.sellpia.status = 'STALE'; }],
    ['advertising', () => { mocks.statusData.sources.advertising.status = 'MISSING'; }],
    ['mapping', () => { mocks.statusData.sources.mapping.status = 'STALE'; }],
  ])('disables recalculation until %s is ready', (_source, makeUnavailable) => {
    makeUnavailable();
    renderAction();

    expect(screen.getByRole('button', { name: '등급 새로고침' })).toBeDisabled();
  });

  it('keeps official grades and explains SOURCE_NOT_READY inline', async () => {
    mocks.recalculateProductAbc.mockResolvedValue({
      outcome: 'SOURCE_NOT_READY',
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      actualCutoff: '2026-08-31',
      sources: {
        sellpia: source('STALE'),
        advertising: source('READY'),
      },
    });

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(/원천이 준비되지 않아 기존 공식 등급을 유지합니다/))
      .toBeInTheDocument();
    expect(screen.getByText(/^공식 등급 기준일 2026-07-31$/)).toBeInTheDocument();
    expect(mocks.refetchProducts).not.toHaveBeenCalled();
  });

  it('refetches once and shows retry guidance for INPUT_CHANGED without auto-retry', async () => {
    mocks.recalculateProductAbc.mockRejectedValue(
      new ApiError(409, 'INPUT_CHANGED', 'Inputs changed'),
    );

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(/입력이 변경되었습니다.*다시 시도/)).toBeInTheDocument();
    expect(mocks.recalculateProductAbc).toHaveBeenCalledTimes(1);
    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
    expect(mocks.refetchQueries).toHaveBeenCalledTimes(2);
    expect(mocks.mutationOptions?.retry).toBe(false);
  });
});

function renderAction() {
  return render(
    <ProductOperationsDataStatusAction
      open
      onOpenChange={vi.fn()}
      onProductsRefetch={mocks.refetchProducts}
      periodDays={30}
    />,
  );
}

function readyStatus() {
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
      mapping: { status: 'READY' as 'READY' | 'STALE' | 'MISSING', generation: '7' },
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
