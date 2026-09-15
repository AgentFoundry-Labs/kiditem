import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayRecommendationsPage } from './TodayRecommendationsPage';
import { useWingCatalogSource } from '../../hooks/use-wing-catalog-source';

const start = vi.fn(async () => ({ id: '10000000-0000-4000-8000-000000000001' }));

vi.mock('../../hooks/use-wing-catalog-source', () => ({
  useWingCatalogSource: vi.fn(() => ({
    control: {
      state: 'idle', statusRead: 'current', running: null, canStop: false, notice: null,
      start: vi.fn(), stop: vi.fn(),
    },
    attempt: null,
    start,
  })),
}));

vi.mock('../../market/lib/trend-collection-api', () => ({
  fetchPopularKeywordBoards: vi.fn(async () => ({ boards: [] })),
}));

vi.mock('../../hooks/use-sourcing-workspace', () => ({
  useSourcingRecommendations: () => ({ data: undefined, isLoading: false, error: null }),
  useIngestSourcingCoupangObservations: () => ({ mutateAsync: vi.fn() }),
  useSourcingInterestTargets: () => ({ data: [], refetch: vi.fn() }),
  useSaveSourcingInterestTarget: () => ({ mutateAsync: vi.fn() }),
  useRefreshSourcingRecommendations: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRefreshSourcingValidation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TodayRecommendationsPage />
    </QueryClientProvider>,
  );
}

describe('TodayRecommendationsPage Wing operation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts one normalized recommendation-validation operation and no mount provider work', async () => {
    renderPage();

    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '직접 편집' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: {
        value: ['  Ａ   Pencil  ', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)].join('\n'),
      },
    });
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: '키워드 검증 시작' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(useWingCatalogSource).toHaveBeenLastCalledWith(expect.objectContaining({
            input: {
        keywords: ['A Pencil', ...Array.from({ length: 11 }, (_, index) => `키워드 ${index + 2}`)],
        maxPages: 1,
        purpose: 'recommendation_validation',
      },
    }));
  });
});
