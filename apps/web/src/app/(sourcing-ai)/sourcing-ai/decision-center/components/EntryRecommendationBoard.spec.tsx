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
const operationMocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  useAction: vi.fn(),
}));
const routerPushMock = vi.hoisted(() => vi.fn());
const openConversationMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: operationMocks.useAction,
}));
vi.mock('../../components/SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({
    onCancel,
    onRetryAttention,
  }: {
    onCancel?: () => void;
    onRetryAttention?: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>interest-operation-cancel</button>
      <button type="button" onClick={onRetryAttention}>interest-operation-retry</button>
    </div>
  ),
}));
vi.mock('../../hooks/use-sourcing-workspace', () => ({
  useSaveSourcingReviewSelection: vi.fn(),
  useSourcingInterestTargets: vi.fn(),
  useSourcingRecommendations: vi.fn(),
  useSourcingReviewSelections: vi.fn(),
}));
vi.mock('@/components/agent-interaction/conversation-surface-state', () => ({
  openConversation: openConversationMock,
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
    operationMocks.start.mockResolvedValue({ id: 'operation-1688' });
    operationMocks.useAction.mockReturnValue({
      run: null,
      start: operationMocks.start,
      cancel: operationMocks.cancel,
      retryAttention: operationMocks.retryAttention,
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
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

  it('opens a fixed Sourcing conversation without mutating an existing conversation', async () => {
    const user = userEvent.setup();
    const question = '테스트 지금 진입해도 될까? 근거로 설명해줘.';

    renderBoard();
    await user.click(await screen.findByText('상품 A'));
    await user.click(screen.getByRole('button', { name: 'AgentOS에서 묻기' }));

    expect(openConversationMock).toHaveBeenCalledWith({ fixedAgentKey: 'sourcing', draft: question });
    expect(routerPushMock).toHaveBeenCalledWith('/agent-os');
  });

  it('reads the persisted entry snapshot on mount and starts the exact 1688 operation only from the missing-supply CTA', async () => {
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
    expect(operationMocks.useAction).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'sourcing.collect_1688_trends',
      input: { keywords: ['미수집 키워드'] },
      snapshotQueryKey: ['sourcing', 'workspace', 'org-a'],
    }));

    await user.click(await screen.findByRole('button', { name: '1688 공급 찾기 (1)' }));

    await waitFor(() => expect(operationMocks.start).toHaveBeenCalledWith({
      keywords: ['미수집 키워드'],
    }));
    expect(screen.getByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();

    await user.click(screen.getAllByRole('button', { name: 'interest-operation-cancel' })[1]);
    await user.click(screen.getAllByRole('button', { name: 'interest-operation-retry' })[1]);
    expect(operationMocks.cancel).toHaveBeenCalledTimes(1);
    expect(operationMocks.retryAttention).toHaveBeenCalledTimes(1);

    view.unmount();
    renderBoard();
    expect(await screen.findByRole('checkbox', { name: '상품 A 선택' })).toBeChecked();
    expect(operationMocks.start).toHaveBeenCalledTimes(1);
  });

  it('bounds the explicit 1688 CTA to twenty normalized unique interest keywords', async () => {
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

    await waitFor(() => expect(operationMocks.start).toHaveBeenCalledWith({
      keywords: ['A Pencil', ...uniqueKeywords.slice(0, 19)],
    }));
  });

  it('starts the daily collection exactly once from the toolbar, without a direct recommendation refresh', async () => {
    const user = userEvent.setup();
    renderBoard();

    expect(operationMocks.start).not.toHaveBeenCalled();
    expect(operationMocks.useAction).toHaveBeenCalledWith(expect.objectContaining({
      operationKey: 'sourcing.collect_daily_trends',
      input: {},
      snapshotQueryKey: ['sourcing', 'workspace', 'org-a'],
      wakeBrowserRuntime: true,
    }));

    await user.click(screen.getByRole('button', { name: '지금 수집' }));
    await waitFor(() => expect(operationMocks.start).toHaveBeenCalledWith({}));
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
