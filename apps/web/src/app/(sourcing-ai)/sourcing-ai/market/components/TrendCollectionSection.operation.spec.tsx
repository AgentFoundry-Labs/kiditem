import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionSection } from './TrendCollectionSection';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  retryAttention: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: mocks.useAction,
}));


vi.mock('../lib/trend-collection-api', () => ({
  TREND_SOURCE_ORDER: ['naver', 'shorts'],
  TREND_SOURCE_META: {
    naver: { label: 'Naver', className: 'naver' },
    '1688': { label: '1688', className: 'wholesale' },
    shorts: { label: 'Shorts', className: 'shorts' },
  },
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
      error: null, actualCutoffAt: null, result: null,
      collect: mocks.start,
      cancel: mocks.cancel,
      retryAttention: mocks.retryAttention,
      isCollecting: false,
      isCancelling: false,
      isRetrying: false,
    });
  });

  it('mounts persisted reads only and starts one parent operation from the CTA', async () => {
    renderSection();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByText('persisted-trend-snapshots')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '트렌드 수집' }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
    expect(mocks.start).toHaveBeenCalledWith({
      sources: ['naver', 'shorts'],
    });
    expect(mocks.useAction).toHaveBeenCalledWith({
      input: { sources: ['naver', 'shorts'] },
      snapshotQueryKey: ['sourcing', 'trend'],
    });
  });

  it('shows source failure and permits an explicit retry without a false success panel', () => {
    mocks.useAction.mockReturnValue({ collect: mocks.start, isCollecting: false, error: 'Shorts provider failed', actualCutoffAt: null,
      result: { businessDate: '2026-09-06', results: [
        { source: 'naver', state: 'COMPLETE', ok: true, collected: 12 },
        { source: 'shorts', state: 'FAILED', ok: false, collected: 0, error: 'Shorts provider failed' },
      ] } });
    renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent('Shorts provider failed');
    expect(screen.getByText('12건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '트렌드 수집' }));
    expect(mocks.start).toHaveBeenCalledOnce();
  });
});
