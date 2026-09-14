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

vi.mock('./ProductOperationsSourceCollections', () => ({
  ProductOperationsSourceCollections: () => <div>Sellpia source controls</div>,
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
    ['sellpia', () => { mocks.statusData.sources.sellpia.ready = false; }],
    ['advertising', () => { mocks.statusData.sources.advertising = source(false, false); }],
    ['mapping', () => { mocks.statusData.sources.mapping.ready = false; }],
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
        sellpia: source(false),
        advertising: source(true),
      },
    });

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(/원천이 준비되지 않아 기존 공식 등급을 유지합니다/))
      .toBeInTheDocument();
    expect(screen.getByText(/^공식 등급 기준일 2026-07-31$/)).toBeInTheDocument();
    expect(mocks.refetchProducts).not.toHaveBeenCalled();
  });

  // Refreshed on 2026-09-07, so each source is due through the closed day 2026-09-06.
  const closedDay = '2026-09-06';
  it.each([
    {
      reason: 'advertising held its closed day',
      sellpiaEnd: closedDay,
      advertisingEnd: '2026-09-05',
      advertisingHeld: true,
      message: '마지막으로 완료된 광고 손익 수집은 어제 광고비를 확정하지 못해 그제까지만 반영했습니다. 기존 공식 등급을 유지합니다. 쿠팡 보고가 늦었다면 보고 뒤 다시 수집해 주세요. 어제 광고를 멈춘 계정이면 내일 수집에서 반영됩니다. 공식 등급 기준일 2026-07-31',
    },
    {
      reason: 'advertising ends before Sellpia',
      sellpiaEnd: closedDay,
      advertisingEnd: '2026-09-05',
      advertisingHeld: false,
      message: '광고 손익 기준일(2026-09-05)이 셀피아(2026-09-06)보다 이릅니다. 광고 손익을 다시 수집해 주세요. 공식 등급 기준일 2026-07-31',
    },
    {
      reason: 'Sellpia ends before advertising',
      sellpiaEnd: '2026-09-05',
      advertisingEnd: closedDay,
      advertisingHeld: false,
      message: '셀피아 상품 손익 기준일(2026-09-05)이 광고 손익(2026-09-06)보다 이릅니다. 셀피아 상품 손익을 다시 수집해 주세요. 공식 등급 기준일 2026-07-31',
    },
  ])('names the late source when no pair exists because $reason', async ({ sellpiaEnd, advertisingEnd, advertisingHeld, message }) => {
    // Each source's cutoffs and its pairing end come from its one end date, as the server builds them.
    mocks.recalculateProductAbc.mockResolvedValue({
      outcome: 'SOURCE_NOT_READY',
      publicationRevision: 4,
      officialCutoff: '2026-07-31',
      actualCutoff: null,
      sources: {
        sellpia: sourceEndingOn(sellpiaEnd, closedDay),
        // Advertising that held the closed day is due only through the day it confirmed.
        advertising: sourceEndingOn(advertisingEnd, advertisingHeld ? advertisingEnd : closedDay),
      },
      pairing: {
        lateSource: advertisingEnd < sellpiaEnd ? 'advertising' : 'sellpia',
        sellpiaEndDate: sellpiaEnd,
        advertisingEndDate: advertisingEnd,
      },
    });

    renderAction();
    fireEvent.click(screen.getByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/원천이 준비되지 않아|데이터 기준일 없음/)).not.toBeInTheDocument();
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

/**
 * A source whose newest complete generation ends on `end` and is due through
 * `requiredCutoff`: that end is both its actual and its latest complete cutoff,
 * and it is ready once it reaches the required cutoff.
 */
function sourceEndingOn(end: string, requiredCutoff: string) {
  return {
    ready: end >= requiredCutoff,
    requiredCutoff,
    actualCutoff: end,
    latestAttempt: { state: 'COMPLETE' as const },
    latestComplete: { actualCutoff: end },
  };
}

/** `collected: false` is the never-collected source: not ready and no cutoff to show. */
function source(ready: boolean, collected = true) {
  const actualCutoff = collected ? '2026-08-31' : null;
  return {
    ready,
    requiredCutoff: '2026-08-31',
    actualCutoff,
    latestAttempt: collected ? { state: 'COMPLETE' as const } : null,
    latestComplete: collected ? { actualCutoff } : null,
  };
}
