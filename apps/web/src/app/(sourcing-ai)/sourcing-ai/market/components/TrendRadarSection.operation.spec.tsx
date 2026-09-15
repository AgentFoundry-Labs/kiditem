import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrendRadarSection } from './TrendRadarSection';

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

vi.mock('../lib/live-sns-market', () => ({
  fetchLiveSnsMarket: vi.fn().mockResolvedValue({
    generatedAt: '',
    opportunities: [],
    warnings: [],
  }),
}));

function renderRadar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TrendRadarSection />
    </QueryClientProvider>,
  );
}

describe('TrendRadarSection Naver source boundary', () => {
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

  it('keeps the default domestic mount read-only and starts Naver only from the explicit CTA', async () => {
    const view = renderRadar();

    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledOnce());
    expect(mocks.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '네이버 수집' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());

    view.unmount();
    renderRadar();
    await waitFor(() => expect(mocks.fetchNaver).toHaveBeenCalledTimes(2));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });
});
