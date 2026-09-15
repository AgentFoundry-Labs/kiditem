import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SellochMarketAnalysisPage } from './SellochMarketAnalysisPage';
import { useWingCatalogSource } from '../hooks/use-wing-catalog-source';

const start = vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' }));
let capturedOptions: Record<string, unknown> | null = null;

vi.mock('../hooks/use-wing-catalog-source', () => ({
  useWingCatalogSource: vi.fn((options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      control: {
        state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
        start: vi.fn(), stop: vi.fn(),
      },
      attempt: null,
      start,
    };
  }),
}));

vi.mock('../market/lib/trend-collection-api', () => ({
  fetchPopularKeywordBoards: vi.fn(async () => ({
    boards: [{
      boardKey: 'stationery',
      boardLabel: '문구',
      latest: Array.from({ length: 12 }, (_, index) => ({
        rank: index + 1,
        keyword: index === 0 ? '  Ａ   Pencil  ' : `키워드 ${index + 1}`,
      })),
    }],
  })),
}));

vi.mock('../hooks/use-sourcing-workspace', () => ({
  useSourcingRecommendations: () => ({ data: undefined, isLoading: false, error: null }),
  useIngestSourcingCoupangObservations: () => ({ mutateAsync: vi.fn() }),
  useRefreshSourcingRecommendations: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRefreshSourcingValidation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SellochMarketAnalysisPage />
    </QueryClientProvider>,
  );
}

describe('SellochMarketAnalysisPage Wing operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
  });

  it('starts one normalized 12-keyword market operation only from the explicit CTA', async () => {
    renderPage();

    expect(start).not.toHaveBeenCalled();
    await waitFor(() => expect(
      (capturedOptions?.input as { keywords?: string[] } | undefined)?.keywords,
    ).toHaveLength(12));
    fireEvent.click(await screen.findByRole('button', { name: '시장분석 시작' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(useWingCatalogSource).toHaveBeenLastCalledWith(expect.objectContaining({
            input: {
        keywords: ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)],
        maxPages: 1,
        purpose: 'market_analysis',
      },
    }));
    expect(capturedOptions).not.toBeNull();
  });
});
