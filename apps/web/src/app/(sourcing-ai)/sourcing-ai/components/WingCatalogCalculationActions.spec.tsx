import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { WingCatalogCalculationActions } from './WingCatalogCalculationActions';
import type { WingCatalogAttempt } from '../lib/sourcing-wing-source-owner';

vi.mock('@/lib/api-client', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RECOMMENDATIONS_PATH = '/api/sourcing/workspace/recommendations/refresh';
const VALIDATION_PATH = '/api/sourcing/workspace/validation/refresh';

function attempt(state: WingCatalogAttempt['state'], purpose: string): WingCatalogAttempt {
  return {
    attemptId: ATTEMPT_ID,
    state,
    plan: { keywords: ['연필'], maxPages: 1, purpose },
    errorCode: null,
    errorMessage: null,
  };
}

const validationEnvelope = {
  ready: true,
  generatedAt: '2026-09-14T00:00:00.000Z',
  lastSuccessfulAt: '2026-09-14T00:00:00.000Z',
  freshUntil: null,
  operationId: null,
  warnings: [],
  error: null,
  data: { recommendationRunId: '00000000-0000-4000-8000-000000000001', nextCursor: null, items: [] },
};

function renderActions(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return {
    ...view,
    rerender: (next: ReactNode) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WingCatalogCalculationActions', () => {
  it('refreshes recommendations only from a completed market-analysis or validation Wing collection', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { runId: 'run-1' }, error: null });
    const view = renderActions(<WingCatalogCalculationActions attempt={attempt('RUNNING', 'market_analysis')} />);
    expect(screen.getByRole('button', { name: '추천 갱신' })).toBeDisabled();

    view.rerender(<WingCatalogCalculationActions attempt={attempt('COMPLETE', 'catalog_search')} />);
    expect(screen.getByRole('button', { name: '추천 갱신' })).toBeDisabled();

    view.rerender(<WingCatalogCalculationActions attempt={attempt('COMPLETE', 'market_analysis')} />);
    fireEvent.click(screen.getByRole('button', { name: '추천 갱신' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(RECOMMENDATIONS_PATH, { sourceOperationId: ATTEMPT_ID }));
    expect(apiClient.post).not.toHaveBeenCalledWith(VALIDATION_PATH);
    expect(screen.queryByRole('button', { name: '검증 갱신' })).not.toBeInTheDocument();
  });

  it('refreshes validation from its own explicit control', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(validationEnvelope);
    renderActions(<WingCatalogCalculationActions attempt={null} validation />);

    fireEvent.click(screen.getByRole('button', { name: '검증 갱신' }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith(VALIDATION_PATH));
    expect(apiClient.post).not.toHaveBeenCalledWith(RECOMMENDATIONS_PATH, expect.anything());
  });

  it('names a recommendation refresh the owner did not publish in Korean', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: null, error: { message: 'no source rows' } });
    renderActions(<WingCatalogCalculationActions attempt={attempt('COMPLETE', 'recommendation_validation')} />);

    fireEvent.click(screen.getByRole('button', { name: '추천 갱신' }));

    expect(await screen.findByText('추천을 갱신하지 못했습니다.')).toBeInTheDocument();
  });
});
