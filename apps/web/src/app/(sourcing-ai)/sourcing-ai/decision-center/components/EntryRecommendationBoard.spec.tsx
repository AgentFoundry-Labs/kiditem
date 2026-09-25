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
const OPERATION_ID = '10000000-0000-4000-8000-000000001688';

function operation1688(status: 'executing' | 'cancelled') {
  return {
    id: OPERATION_ID,
    kind: 'sourcing.trend_1688',
    status,
    lockKeys: ['resource:ali1688:all'],
    plan: { sourceKey: '1688.hot_product', targetKey: 'all' },
    progress: null,
    result: null,
    window: null,
    errorCode: status === 'cancelled' ? 'USER_CANCELLED' : null,
    errorMessage: status === 'cancelled' ? '운영자가 수집을 중단했습니다.' : null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
  };
}
const ITEM_A_KEY = 'a'.repeat(64);
const ITEM_B_KEY = 'b'.repeat(64);
const trendMocks = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: () => ({
    control: {
      state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
      start: vi.fn(), stop: vi.fn(),
    },
    start: trendMocks.collect,
    isCollecting: false,
    error: null,
    actualCutoffAt: null,
  }),
}));

const operationMocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancelInExtension: vi.fn(),
  list: vi.fn(),
  cancelOnServer: vi.fn(),
}));
const routerPushMock = vi.hoisted(() => vi.fn());
const openConversationFromLauncherMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/operation-start', () => ({
  requestOperationStart: operationMocks.start,
  requestOperationCancel: operationMocks.cancelInExtension,
}));
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (path: string) => operationMocks.list(path),
    post: (path: string) => operationMocks.cancelOnServer(path),
  },
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
    operationMocks.start.mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    operationMocks.list.mockResolvedValue({ operations: [] });
    // 이 브라우저에는 그 실행이 없다 — 중단은 서버 cancel로 간다.
    operationMocks.cancelInExtension.mockRejectedValue(new Error('no extension run'));
    vi.mocked(useAuth).mockReturnValue({
      user: { organizationId: 'org-a' },
    } as ReturnType<typeof useAuth>);
    vi.mocked(useSourcingInterestTargets).mockReturnValue({ data: [] } as never);
    vi.mocked(useSourcingRecommendations).mockReturnValue({
      data: {
        ready: true,
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

  it('reads the persisted entry snapshot on mount and starts the 1688 operation only from the missing-supply CTA, with no UI keyword list', async () => {
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

    expect(operationMocks.start).not.toHaveBeenCalled();
    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    await waitFor(() => expect(operationMocks.list).toHaveBeenCalledWith('/api/operations?kinds=sourcing.trend_1688&limit=20'));

    await user.click(await screen.findByRole('button', { name: '1688 공급 찾기 (1)' }));

    // 키워드는 서버가 조직의 트렌드 시드에서 정한다 — 화면은 빈 scope만 보낸다(KID-360).
    await waitFor(() => expect(operationMocks.start).toHaveBeenCalledWith('sourcing.trend_1688', {}));
    expect(screen.getByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();

    view.unmount();
    renderBoard();
    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    expect(operationMocks.start).toHaveBeenCalledTimes(1);
  });

  it('shows the running 1688 collection with a stop that ends it through the operation cancel, then shows it stopped', async () => {
    const user = userEvent.setup();
    operationMocks.list.mockResolvedValue({ operations: [operation1688('executing')] });
    operationMocks.cancelOnServer.mockImplementation(async () => {
      operationMocks.list.mockResolvedValue({ operations: [operation1688('cancelled')] });
    });

    renderBoard();
    await user.click(await screen.findByRole('button', { name: '수집 중단' }));

    expect(await screen.findByText('수집을 중단했습니다. 저장된 완료본은 유지됩니다.')).toBeInTheDocument();
    expect(operationMocks.cancelInExtension).toHaveBeenCalledWith(OPERATION_ID);
    expect(operationMocks.cancelOnServer).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
    expect(operationMocks.start).not.toHaveBeenCalled();
    expect(screen.queryByText('운영자가 수집을 중단했습니다.')).not.toBeInTheDocument();
  });

  it('starts the daily collection exactly once from the toolbar, without a direct recommendation refresh', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(trendMocks.collect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '지금 수집' }));
    await waitFor(() => expect(trendMocks.collect).toHaveBeenCalledTimes(1));
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
