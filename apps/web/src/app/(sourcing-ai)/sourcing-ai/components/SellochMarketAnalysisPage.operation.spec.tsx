import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SellochMarketAnalysisPage } from './SellochMarketAnalysisPage';
import { useSourcingOperationAction } from '../hooks/use-sourcing-operation-action';

const start = vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' }));
let capturedOptions: Record<string, unknown> | null = null;

vi.mock('../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn((options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      run: null,
      start,
      cancel: vi.fn(),
      retryAttention: vi.fn(),
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
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
    expect(useSourcingOperationAction).toHaveBeenLastCalledWith(expect.objectContaining({
      operationKey: 'sourcing.collect_wing_catalog_batch',
      input: {
        keywords: ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)],
        maxPages: 1,
        purpose: 'market_analysis',
      },
    }));
    expect(capturedOptions).not.toBeNull();
  });
});
