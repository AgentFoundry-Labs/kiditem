import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionSection } from './TrendCollectionSection';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  collectTrend: vi.fn(),
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
    onCancel: () => Promise<void> | void;
    onRetryAttention: () => Promise<void> | void;
  }) => (
    <div>
      <span>run:{run?.status ?? 'none'}</span>
      <button type="button" onClick={() => void onCancel()}>cancel-run</button>
      <button type="button" onClick={() => void onRetryAttention()}>retry-run</button>
    </div>
  ),
}));

vi.mock('../lib/trend-collection-api', () => ({
  TREND_SOURCE_ORDER: ['naver', '1688', 'shorts'],
  TREND_SOURCE_META: {
    naver: { label: 'Naver', className: 'naver' },
    '1688': { label: '1688', className: 'wholesale' },
    shorts: { label: 'Shorts', className: 'shorts' },
  },
  collectTrend: mocks.collectTrend,
  fetchTrendSeeds: vi.fn().mockResolvedValue([]),
}));

vi.mock('./TrendSeedManager', () => ({
  TrendSeedManager: () => <div>seed-manager</div>,
}));

vi.mock('./TrendCollectionViews', () => ({
  TrendCollectionViews: () => <div>persisted-trend-snapshots</div>,
}));

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrendCollectionSection />
    </QueryClientProvider>,
  );
}

describe('TrendCollectionSection operation migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({ id: 'run-1' });
    mocks.cancel.mockResolvedValue(null);
    mocks.retryAttention.mockResolvedValue(null);
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

  it('mounts persisted reads only and starts one parent operation from the CTA', async () => {
    renderSection();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.collectTrend).not.toHaveBeenCalled();
    expect(screen.getByText('persisted-trend-snapshots')).toBeInTheDocument();
    expect(screen.getByText('run:none')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '트렌드 수집' }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.start).toHaveBeenCalledWith({
      sources: ['naver', '1688', 'shorts'],
    });
    expect(mocks.collectTrend).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({
      operationKey: 'sourcing.collect_daily_trends',
      input: { sources: ['naver', '1688', 'shorts'] },
      snapshotQueryKey: ['sourcing', 'trend'],
      wakeBrowserRuntime: false,
    });
  });

  it('delegates cancellation and attention retry to the shared run panel', async () => {
    mocks.useAction.mockReturnValue({
      run: { status: 'attention_required', result: null },
      start: mocks.start,
      cancel: mocks.cancel,
      retryAttention: mocks.retryAttention,
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    });
    renderSection();

    fireEvent.click(screen.getByRole('button', { name: 'cancel-run' }));
    fireEvent.click(screen.getByRole('button', { name: 'retry-run' }));

    await waitFor(() => {
      expect(mocks.cancel).toHaveBeenCalledOnce();
      expect(mocks.retryAttention).toHaveBeenCalledOnce();
    });
  });
});
