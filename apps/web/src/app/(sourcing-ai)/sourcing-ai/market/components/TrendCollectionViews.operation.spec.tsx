import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionViews } from './TrendCollectionViews';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: mocks.useAction,
}));

vi.mock('../../components/SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({
    run,
    onCancel,
    onRetryAttention,
  }: {
    run: { status: string } | null;
    onCancel?: () => void;
    onRetryAttention?: () => void;
  }) => (
    <div>
      <span>tiktok-run:{run?.status ?? 'none'}</span>
      <button type="button" onClick={onCancel}>tiktok-operation-cancel</button>
      <button type="button" onClick={onRetryAttention}>tiktok-operation-retry</button>
    </div>
  ),
}));

vi.mock('./LiveCommerceSection', () => ({
  LiveCommerceSection: () => <div>persisted-live-commerce-snapshot</div>,
}));

vi.mock('../lib/trend-collection-api', () => ({
  fetch1688HotProducts: vi.fn(async () => ({ offers: [], capturedAt: null })),
  fetchNaverKeywordTrends: vi.fn(async () => ({ keywords: [] })),
  fetchPopularKeywordBoards: vi.fn(async () => ({ boards: [] })),
  fetchShortsTrends: vi.fn(async () => ({ items: [] })),
  fetchTiktokCcTrends: vi.fn(async () => ({
    regions: [{
      region: 'KR',
      items: [{
        trendType: 'keyword',
        entityKey: 'persisted-tiktok',
        label: '보존된 틱톡 스냅샷',
        rank: 1,
        newlyRanked: false,
        growthPct: null,
        sourceUrl: null,
      }],
    }],
    capturedAt: '2026-08-14T00:00:00.000Z',
  })),
}));

vi.mock('../lib/live-commerce-api', () => ({
  fetchLiveCommerceKeywords: vi.fn(async () => ({ keywords: [] })),
}));

function renderViews() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrendCollectionViews />
    </QueryClientProvider>,
  );
}

describe('TrendCollectionViews TikTok browser operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ id: 'tiktok-operation-run' });
    mocks.useAction.mockReturnValue({
      run: null,
      start: mocks.start,
      cancel: mocks.cancel,
      retryAttention: mocks.retryAttention,
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    });
  });

  it('reads persisted trend snapshots on mount and starts TikTok only from its CTA', async () => {
    const view = renderViews();

    expect(screen.getByText('persisted-live-commerce-snapshot')).toBeInTheDocument();
    expect(await screen.findByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({
      operationKey: 'sourcing.collect_tiktok_cc_trends',
      input: {},
      snapshotQueryKey: ['sourcing', 'trend', 'tiktok-cc', 7],
    });

    fireEvent.click(screen.getByRole('button', { name: '틱톡 수집' }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({}));
    expect(screen.getByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tiktok-operation-cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'tiktok-operation-retry' }));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    expect(mocks.retryAttention).toHaveBeenCalledTimes(1);

    view.unmount();
    renderViews();
    expect(await screen.findByText('보존된 틱톡 스냅샷')).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
