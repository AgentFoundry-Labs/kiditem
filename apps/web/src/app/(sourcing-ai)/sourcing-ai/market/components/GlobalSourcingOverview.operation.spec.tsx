import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSourcingOverview } from './GlobalSourcingOverview';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  useAction: vi.fn(),
  fetchNaver: vi.fn(),
}));

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: mocks.useAction,
}));

vi.mock('../../components/SourcingOperationRunPanel', () => ({
  SourcingOperationRunPanel: ({ onCancel, onRetryAttention }: {
    onCancel: () => void;
    onRetryAttention: () => void;
  }) => (
    <div>
      <button type="button" onClick={onCancel}>naver-operation-cancel</button>
      <button type="button" onClick={onRetryAttention}>naver-operation-retry</button>
    </div>
  ),
}));

vi.mock('../lib/live-naver-market', () => ({
  fetchPersistedNaverMarket: mocks.fetchNaver,
}));

vi.mock('../lib/trend-collection-api', () => ({
  fetch1688HotProducts: vi.fn().mockResolvedValue({ offers: [], capturedAt: null }),
  fetchShortsTrends: vi.fn().mockResolvedValue({ items: [], capturedAt: null }),
}));

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalSourcingOverview />
    </QueryClientProvider>,
  );
}

describe('GlobalSourcingOverview Naver operation boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchNaver.mockResolvedValue({
      source: 'naver-persisted-snapshot',
      generatedAt: '',
      opportunities: [],
      warnings: [],
    });
    mocks.start.mockResolvedValue({ id: 'naver-run' });
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

  it('mounts only the persisted Naver snapshot and starts one exact operation from its CTA', async () => {
    const view = renderOverview();

    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({
      operationKey: 'sourcing.collect_daily_trends',
      input: { sources: ['naver'] },
      snapshotQueryKey: ['sourcing', 'trend', 'naver-keywords', 30],
      wakeBrowserRuntime: false,
    });

    fireEvent.click(screen.getByRole('button', { name: '네이버 스냅샷 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ sources: ['naver'] }));
    fireEvent.click(screen.getByRole('button', { name: 'naver-operation-cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'naver-operation-retry' }));
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.retryAttention).toHaveBeenCalledOnce();

    view.unmount();
    renderOverview();
    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledTimes(2));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
