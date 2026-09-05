import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/useAuth';
import {
  useSaveSourcingReviewSelection,
  useSourcingInterestTargets,
  useSourcingRecommendations,
  useSourcingReviewSelections,
} from '../../hooks/use-sourcing-workspace';
import { EntryRecommendationBoard } from './EntryRecommendationBoard';

const RUN_ID = '00000000-0000-4000-8000-000000000001';
const ITEM_A_KEY = 'a'.repeat(64);
const ITEM_B_KEY = 'b'.repeat(64);
const trendMocks = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('../../hooks/use-trend-source-collection', () => ({ useTrendSourceCollection: () => ({ collect: trendMocks.collect, isCollecting: false, error: null, actualCutoffAt: null }) }));

const sourceOwnerMocks = vi.hoisted(() => ({
  collect: vi.fn(),
  fetchStatus: vi.fn(),
}));
const routerPushMock = vi.hoisted(() => vi.fn());
const openConversationFromLauncherMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/sourcing-1688-source-owner', () => ({
  collectSourcing1688TrendsFromExtension: sourceOwnerMocks.collect,
  fetchSourcing1688TrendSourceStatus: sourceOwnerMocks.fetchStatus,
}));
vi.mock('../../hooks/use-sourcing-workspace', () => ({
  useSaveSourcingReviewSelection: vi.fn(),
  useSourcingInterestTargets: vi.fn(),
  useSourcingRecommendations: vi.fn(),
  useSourcingReviewSelections: vi.fn(),
}));
vi.mock('@/components/layout/right-surface-launcher-context', () => ({
  useRightSurfaceLauncher: () => ({
    openConversationFromLauncher: openConversationFromLauncherMock,
  }),
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
    vi.clearAllMocks();
    sourceOwnerMocks.collect.mockResolvedValue({
      success: true,
      attemptId: '1688-attempt',
      terminalState: 'COMPLETE',
    });
    sourceOwnerMocks.fetchStatus.mockResolvedValue({
      status: 'READY',
      refreshing: false,
      latestAttempt: null,
      latestComplete: null,
      actualCutoffAt: null,
      errorCode: null,
      errorMessage: null,
    });
    vi.mocked(useAuth).mockReturnValue({
      user: { organizationId: 'org-a' },
    } as ReturnType<typeof useAuth>);
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

  it('opens a fixed Sourcing draft in the global AI chat surface without navigation', async () => {
    const user = userEvent.setup();
    const question = '테스트 지금 진입해도 될까? 근거로 설명해줘.';

    renderBoard();
    await user.click(await screen.findByText('상품 A'));
    await user.click(screen.getByRole('button', { name: '소싱 Agent에게 묻기' }));

    expect(openConversationFromLauncherMock).toHaveBeenCalledWith(
      { fixedAgentKey: 'sourcing', draft: question },
      expect.any(HTMLButtonElement),
    );
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('reads the persisted entry snapshot on mount and starts the direct 1688 source owner only from the missing-supply CTA', async () => {
    const user = userEvent.setup();
    vi.mocked(useSourcingInterestTargets).mockReturnValue({
      data: [{
        targetType: 'keyword',
        sourceKeys: ['manual'],
        label: '미수집 키워드',
        keyword: '미수집 키워드',
      }],
    } as never);

    const view = renderBoard();

    expect(sourceOwnerMocks.collect).not.toHaveBeenCalled();
    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();

    await user.click(await screen.findByRole('button', { name: '1688 공급 찾기 (1)' }));

    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
    }));
    expect(screen.getByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();

    view.unmount();
    renderBoard();
    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    expect(sourceOwnerMocks.collect).toHaveBeenCalledTimes(1);
  });

  it('does not send a mutable UI keyword list to the direct 1688 source owner', async () => {
    const user = userEvent.setup();
    const uniqueKeywords = Array.from({ length: 21 }, (_, index) => `키워드 ${index + 1}`);
    vi.mocked(useSourcingInterestTargets).mockReturnValue({
      data: [
        {
          targetType: 'keyword',
          sourceKeys: ['manual'],
          label: '  Ａ   Pencil ',
          keyword: '  Ａ   Pencil ',
        },
        {
          targetType: 'keyword',
          sourceKeys: ['manual'],
          label: 'a pencil',
          keyword: 'a pencil',
        },
        ...uniqueKeywords.map((keyword) => ({
          targetType: 'keyword' as const,
          sourceKeys: ['manual'],
          label: keyword,
          keyword,
        })),
      ],
    } as never);

    renderBoard();
    await user.click(await screen.findByRole('button', { name: /1688 공급 찾기/ }));

    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledWith({
      idempotencyKey: expect.any(String),
    }));
    expect(sourceOwnerMocks.collect.mock.calls[0]?.[0]).not.toHaveProperty('keywords');
  });

  it('reuses the direct source request key after an uncertain extension response', async () => {
    const user = userEvent.setup();
    vi.mocked(useSourcingInterestTargets).mockReturnValue({
      data: [{
        targetType: 'keyword',
        sourceKeys: ['manual'],
        label: '미수집 키워드',
        keyword: '미수집 키워드',
      }],
    } as never);
    sourceOwnerMocks.collect
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({
        success: true,
        attemptId: '1688-attempt',
        terminalState: 'COMPLETE',
      });

    renderBoard();
    const collect = await screen.findByRole('button', { name: '1688 공급 찾기 (1)' });
    await user.click(collect);
    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledTimes(1));
    await user.click(collect);
    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledTimes(2));

    expect(sourceOwnerMocks.collect.mock.calls[1]?.[0]?.idempotencyKey).toBe(
      sourceOwnerMocks.collect.mock.calls[0]?.[0]?.idempotencyKey,
    );
  });

  it('clears the direct source request key after a terminal failure so a new user retry starts fresh', async () => {
    const user = userEvent.setup();
    vi.mocked(useSourcingInterestTargets).mockReturnValue({
      data: [{
        targetType: 'keyword',
        sourceKeys: ['manual'],
        label: '미수집 키워드',
        keyword: '미수집 키워드',
      }],
    } as never);
    sourceOwnerMocks.collect
      .mockResolvedValueOnce({
        success: false,
        attemptId: '1688-attempt',
        terminalState: 'FAILED',
        error: 'owner failed',
      })
      .mockResolvedValueOnce({
        success: true,
        attemptId: '1688-attempt-2',
        terminalState: 'COMPLETE',
      });

    renderBoard();
    const collect = await screen.findByRole('button', { name: '1688 공급 찾기 (1)' });
    await user.click(collect);
    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledTimes(1));
    await user.click(collect);
    await waitFor(() => expect(sourceOwnerMocks.collect).toHaveBeenCalledTimes(2));

    expect(sourceOwnerMocks.collect.mock.calls[1]?.[0]?.idempotencyKey).not.toBe(
      sourceOwnerMocks.collect.mock.calls[0]?.[0]?.idempotencyKey,
    );
  });

  it('starts the daily collection exactly once from the toolbar, without a direct recommendation refresh', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(trendMocks.collect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '지금 수집' }));
    await waitFor(() => expect(trendMocks.collect).toHaveBeenCalledWith({}));
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
