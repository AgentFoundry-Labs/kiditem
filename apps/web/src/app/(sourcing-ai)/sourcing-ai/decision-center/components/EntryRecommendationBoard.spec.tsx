import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { askSourcingAssistant } from '../lib/entry-recommendation-api';
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

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useOperationRun', () => ({ useOperationRun: vi.fn() }));
vi.mock('@/lib/manual-operation-actions', () => ({ startTrendCollectionAction: vi.fn() }));
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
    vi.mocked(askSourcingAssistant).mockReset();
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

  it('reuses only the conversation returned during the mounted panel session', async () => {
    const user = userEvent.setup();
    vi.mocked(askSourcingAssistant)
      .mockResolvedValueOnce(assistantAnswer('첫 답변', 'conversation-1'))
      .mockResolvedValueOnce(assistantAnswer('두 번째 답변', 'conversation-1'));

    renderBoard();
    const input = await screen.findByRole('textbox', { name: '어시스턴트 질문' });
    await user.type(input, '첫 질문');
    await user.click(screen.getByRole('button', { name: '질문 보내기' }));
    await screen.findByText('첫 답변');
    await user.type(input, '두 번째 질문');
    await user.click(screen.getByRole('button', { name: '질문 보내기' }));
    await screen.findByText('두 번째 답변');

    await waitFor(() => expect(askSourcingAssistant).toHaveBeenCalledTimes(2));
    expect(askSourcingAssistant).toHaveBeenNthCalledWith(1, expect.objectContaining({
      question: '첫 질문',
      conversationId: undefined,
    }));
    expect(askSourcingAssistant).toHaveBeenNthCalledWith(2, expect.objectContaining({
      question: '두 번째 질문',
      conversationId: 'conversation-1',
    }));
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

    await user.click(screen.getByRole('button', { name: 'interest-operation-cancel' }));
    await user.click(screen.getByRole('button', { name: 'interest-operation-retry' }));
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
});

function assistantAnswer(text: string, conversationId: string) {
  return {
    mode: 'generated' as const,
    text,
    citations: [],
    documentCount: 1,
    runtime: 'codex' as const,
    model: 'gpt-5.6-sol',
    degradedReason: null,
    degradedCode: null,
    conversationId,
  };
}

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
