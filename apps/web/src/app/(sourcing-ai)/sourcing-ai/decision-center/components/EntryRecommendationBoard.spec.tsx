import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/useAuth';
import { useOperationRun } from '@/hooks/useOperationRun';
import {
  useRefreshSourcingRecommendations,
  useSaveSourcingReviewSelection,
  useSourcingInterestTargets,
  useSourcingRecommendations,
  useSourcingReviewSelections,
} from '../../hooks/use-sourcing-workspace';
import { EntryRecommendationBoard } from './EntryRecommendationBoard';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_A_KEY = 'a'.repeat(64);
const ITEM_B_KEY = 'b'.repeat(64);

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useOperationRun', () => ({ useOperationRun: vi.fn() }));
vi.mock('@/lib/manual-operation-actions', () => ({ startTrendCollectionAction: vi.fn() }));
vi.mock('../lib/entry-recommendation-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/entry-recommendation-api')>();
  return { ...actual, askSourcingAssistant: vi.fn() };
});
vi.mock('../../hooks/use-sourcing-workspace', () => ({
  useRefreshSourcingRecommendations: vi.fn(),
  useSaveSourcingReviewSelection: vi.fn(),
  useSourcingInterestTargets: vi.fn(),
  useSourcingRecommendations: vi.fn(),
  useSourcingReviewSelections: vi.fn(),
}));

function renderBoard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EntryRecommendationBoard />
    </QueryClientProvider>,
  );
}

describe('EntryRecommendationBoard review state', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: { organizationId: 'org-a' },
    } as ReturnType<typeof useAuth>);
    vi.mocked(useOperationRun).mockReturnValue({ data: undefined, isError: false } as never);
    vi.mocked(useSourcingInterestTargets).mockReturnValue({ data: [] } as never);
    vi.mocked(useSourcingRecommendations).mockReturnValue({
      data: {
        status: 'ready',
        generatedAt: '2026-08-10T00:00:00.000Z',
        lastSuccessfulAt: '2026-08-10T00:00:00.000Z',
        freshUntil: null,
        operationId: null,
        warnings: [],
        error: null,
        data: {
          runId: RUN_ID,
          nextCursor: null,
          items: [recommendationItem(ITEM_A_KEY, '상품 A'), recommendationItem(ITEM_B_KEY, '상품 B')],
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as never);
    vi.mocked(useSourcingReviewSelections).mockReturnValue({
      data: [
        selection(ITEM_A_KEY, 'selected'),
        selection(ITEM_B_KEY, 'removed'),
      ],
    } as never);
    vi.mocked(useRefreshSourcingRecommendations).mockReturnValue({ mutateAsync: vi.fn() } as never);
    vi.mocked(useSaveSourcingReviewSelection).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never);
  });

  it('restores selected and removed state from the current server recommendation run after remount', async () => {
    const first = renderBoard();

    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    expect(screen.queryByText('상품 B')).not.toBeInTheDocument();

    first.unmount();
    renderBoard();

    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    expect(screen.queryByText('상품 B')).not.toBeInTheDocument();
  });
});

function recommendationItem(itemKey: string, displayName: string) {
  return {
    itemKey,
    sourcePlatform: '1688' as const,
    externalOfferId: displayName,
    variantKey: '',
    rank: 1,
    score: 80,
    grade: 'A' as const,
    baselineAction: 'order' as const,
    reasonCodes: [],
    riskCodes: [],
    displayName,
    keyword: '테스트',
    isNewKeyword: false,
    imageUrl: null,
    sourceUrl: 'https://detail.1688.com/offer/123.html',
    overseasPriceCny: 10,
    overseasPriceKrw: null,
    salePriceKrw: null,
    supplierName: null,
    monthlySales: null,
    repurchaseRate: null,
    tradeScore: null,
    minOrderQuantity: null,
    estimatedMarginRate: null,
    estimatedProfitKrw: null,
    shippingLabel: null,
    rating: null,
    tags: [],
    sourceKeywords: ['테스트'],
    offerObservationIds: [],
    evidenceObservationIds: [],
    scoreComponents: { margin: 80, demand: 80, competition: 80, momentum: 80, supplier: 80 },
    coupang: null,
    interest: null,
    contributingSources: ['supply_1688_new'],
  };
}

function selection(itemKey: string, state: 'selected' | 'removed') {
  return {
    workspaceKey: 'entry' as const,
    recommendationRunId: RUN_ID,
    itemKey,
    state,
    version: 1,
    updatedAt: '2026-08-10T00:00:00.000Z',
  };
}
