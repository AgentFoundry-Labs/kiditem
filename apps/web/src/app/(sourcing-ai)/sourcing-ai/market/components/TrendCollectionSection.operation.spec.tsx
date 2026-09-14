import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendCollectionSection } from './TrendCollectionSection';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
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

describe('TrendCollectionSection trend control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAction.mockReturnValue({
      control: {
    state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
    start: vi.fn(), stop: vi.fn(),
  },
      start: mocks.start,
      isCollecting: false,
      error: null,
      actualCutoffAt: null,
    });
  });

  it('mounts persisted reads only and starts the selected trend sources from the shared control', async () => {
    renderSection();

    expect(mocks.start).not.toHaveBeenCalled();
    expect(screen.getByText('persisted-trend-snapshots')).toBeInTheDocument();
    expect(mocks.useAction).toHaveBeenLastCalledWith({ sources: ['naver', 'shorts'] });

    fireEvent.click(screen.getByRole('button', { name: '트렌드 수집' }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  });

  it('shows the owner failure and the settled source results after an explicit collection', async () => {
    mocks.useAction.mockReturnValue({
      control: {
    state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
    start: vi.fn(), stop: vi.fn(),
  },
      start: mocks.start,
      isCollecting: false,
      error: 'Shorts provider failed',
      actualCutoffAt: null,
    });
    mocks.start.mockImplementation((onSettled?: (result: unknown) => void) => onSettled?.({
      businessDate: '2026-09-06',
      results: [
        { source: 'naver', state: 'COMPLETE', ok: true, collected: 12 },
        { source: 'shorts', state: 'FAILED', ok: false, collected: 0, error: 'Shorts provider failed' },
      ],
    }));
    renderSection();

    expect(screen.getByRole('alert')).toHaveTextContent('Shorts provider failed');
    fireEvent.click(screen.getByRole('button', { name: '트렌드 수집' }));

    expect(await screen.findByText('12건')).toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledOnce();
  });
});
