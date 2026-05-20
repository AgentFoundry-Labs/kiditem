import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { useGenerationHistory } from './useGenerationHistory';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

function HistoryObservers() {
  const { data: parentHistory = [] } = useGenerationHistory('candidate-1');
  const { data: childHistory = [] } = useGenerationHistory('candidate-1', parentHistory);

  return (
    <div data-testid="history-counts">
      {parentHistory.length}:{childHistory.length}
    </div>
  );
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
      },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('useGenerationHistory', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches source-candidate archive even when a nested observer receives an empty initial history', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      items: [
        {
          id: 'generation-1',
          title: 'Generated detail page',
          status: 'completed',
          templateId: 'bold-vertical',
          detailPageData: {},
          imageUrls: [],
          processedImages: {},
          detailPageArtifactId: 'artifact-1',
          detailPageRevisionId: null,
          errorMessage: null,
          productId: null,
          createdAt: '2026-05-17T00:00:00.000Z',
        },
      ],
    });

    renderWithQueryClient(<HistoryObservers />);

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        '/api/ai/content-archive/sourcing/candidate-1?limit=50&contentType=detail_page',
      );
    });
    await waitFor(() => expect(screen.getByTestId('history-counts')).toHaveTextContent('1:1'));
  });
});
