import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalSourcingOverview } from './GlobalSourcingOverview';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  useAction: vi.fn(),
  fetchNaver: vi.fn(),
}));

vi.mock('@/hooks/use-trend-source-collection', () => ({
  useTrendSourceCollection: mocks.useAction,
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

describe('GlobalSourcingOverview Naver source boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchNaver.mockResolvedValue({
      source: 'naver-persisted-snapshot',
      generatedAt: '',
      opportunities: [],
      warnings: [],
    });
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

  it('mounts only the persisted Naver snapshot and starts one exact source request from its CTA', async () => {
    const view = renderOverview();

    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.useAction).toHaveBeenCalledWith({ sources: ['naver'] });

    fireEvent.click(screen.getByRole('button', { name: '네이버 스냅샷 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());

    view.unmount();
    renderOverview();
    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledTimes(2));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
