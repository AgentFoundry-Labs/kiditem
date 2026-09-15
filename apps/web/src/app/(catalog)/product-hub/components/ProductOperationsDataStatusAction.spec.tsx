import type { ReactElement, ReactNode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeQueryClient } from '@/components/providers/query-client';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { ProductOperationsDataStatusAction } from './ProductOperationsDataStatusAction';

const mocks = vi.hoisted(() => ({
  recalculateProductAbc: vi.fn(),
  refetchProducts: vi.fn(),
}));

vi.mock('@/lib/product-abc-api', () => ({
  recalculateProductAbc: mocks.recalculateProductAbc,
}));

vi.mock('./ProductOperationsSourceCollections', () => ({
  ProductOperationsSourceCollections: () => <div>Sellpia source controls</div>,
}));

/**
 * The data status arrives from the API through the app's own query client, so
 * the dialog caches it the way operators get it: a read younger than a minute
 * counts as fresh unless the dialog asks again.
 */
let statusData: ReturnType<typeof readyStatus>;
let queryClient: QueryClient;

describe('ProductOperationsDataStatusAction', () => {
  beforeEach(() => {
    statusData = readyStatus();
    queryClient = makeQueryClient();
    vi.spyOn(apiClient, 'getParsed')
      .mockImplementation(async (_path, schema) => schema.parse(statusData));
    mocks.recalculateProductAbc.mockReset();
    mocks.refetchProducts.mockReset();
    mocks.refetchProducts.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
      sources: {
        sellpia: sourceEndingOn('2026-08-31', '2026-08-31'),
        advertising: sourceEndingOn('2026-08-31', '2026-08-31'),
      },
    });

    renderAction();
    fireEvent.click(await screen.findByRole('button', { name: '등급 새로고침' }));

    // Both sources end on the official cutoff, so the message names none.
    expect(await screen.findByText('ABC 등급을 발행했습니다. 공식 등급 기준일 2026-08-31'))
      .toBeInTheDocument();
    expect(mocks.recalculateProductAbc).toHaveBeenCalledTimes(1);
    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
    // The open dialog read its data status again before the message.
    expect(apiClient.getParsed).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['sellpia', () => { statusData.sources.sellpia.ready = false; }],
    ['advertising', () => { statusData.sources.advertising = source(false, false); }],
    ['mapping', () => { statusData.sources.mapping.ready = false; }],
  ])('keeps the grade refresh available while %s is not ready', async (_source, makeUnavailable) => {
    makeUnavailable();
    renderAction();

    // The server publishes the newest pair that ends together, as the dashboard's refresh does.
    expect(await screen.findByRole('button', { name: '등급 새로고침' })).toBeEnabled();
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
    fireEvent.click(await screen.findByRole('button', { name: '등급 새로고침' }));

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
    fireEvent.click(await screen.findByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText(/원천이 준비되지 않아|데이터 기준일 없음/)).not.toBeInTheDocument();
    expect(mocks.refetchProducts).not.toHaveBeenCalled();
  });

  it('names the source a publication did not reach in the same words as the dashboard', async () => {
    // Sellpia collected through 2026-09-13 while advertising stayed at 2026-09-12,
    // so the pair that ends together on 2026-09-12 published.
    mocks.recalculateProductAbc.mockResolvedValue({
      outcome: 'PUBLISHED',
      publicationRevision: 2,
      formulaRevision: 1,
      officialCutoff: '2026-09-12',
      classifiedProductCount: 4,
      unclassifiedProductCount: 0,
      changedProductCount: 0,
      sources: {
        sellpia: sourceEndingOn('2026-09-13', '2026-09-13'),
        advertising: sourceEndingOn('2026-09-12', '2026-09-13'),
      },
    });

    renderAction();
    fireEvent.click(await screen.findByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(
      'ABC 등급을 발행했습니다. 공식 등급 기준일 2026-09-12 · 반영하지 못한 원천: 셀피아 상품 손익(2026-09-13까지 수집)',
    )).toBeInTheDocument();
  });

  it('refetches once and shows retry guidance for INPUT_CHANGED without a second attempt', async () => {
    mocks.recalculateProductAbc.mockRejectedValue(
      new ApiError(409, 'INPUT_CHANGED', 'Inputs changed'),
    );

    renderAction();
    fireEvent.click(await screen.findByRole('button', { name: '등급 새로고침' }));

    expect(await screen.findByText(/입력이 변경되었습니다.*다시 시도/)).toBeInTheDocument();
    expect(mocks.recalculateProductAbc).toHaveBeenCalledTimes(1);
    expect(mocks.refetchProducts).toHaveBeenCalledTimes(1);
    expect(apiClient.getParsed).toHaveBeenCalledTimes(2);
  });

  it('reads the data status again on every open and holds the grade refresh until that read answers', async () => {
    // The first open reads advertising through 2026-08-30, a day short of its cutoff.
    statusData.sources.advertising = sourceEndingOn('2026-08-30', '2026-08-31');
    const { rerender } = renderAction();
    expect(within(await sourceRow('광고비')).getByText('2026-08-30까지')).toBeInTheDocument();

    // Advertising is collected in another tab, and the operator reopens the
    // dialog within the minute.
    let answer!: () => void;
    vi.mocked(apiClient.getParsed).mockImplementationOnce((_path, schema) => new Promise((resolve) => {
      answer = () => resolve(schema.parse(readyStatus()));
    }));
    rerender(action({ open: false }));
    rerender(action({ open: true }));

    await waitFor(() => expect(apiClient.getParsed).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: '현황 확인 중' })).toBeDisabled();

    await act(async () => answer());
    expect(await screen.findByRole('button', { name: '등급 새로고침' })).toBeEnabled();
    expect(within(await sourceRow('광고비')).getByText('2026-08-31까지')).toBeInTheDocument();
  });
});

function action({ open }: { open: boolean }): ReactElement {
  return (
    <ProductOperationsDataStatusAction
      open={open}
      onOpenChange={vi.fn()}
      onProductsRefetch={mocks.refetchProducts}
      periodDays={30}
    />
  );
}

function renderAction() {
  return render(action({ open: true }), { wrapper });
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function sourceRow(label: string): Promise<HTMLElement> {
  return (await screen.findByText(label)).parentElement!;
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
