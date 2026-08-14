import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeywordAnalysisPage } from './KeywordAnalysisPage';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import { searchCoupangKeywordSuggestions } from '../lib/coupang-keyword-extension';
import { fetchCoupangKeywordSuggestionSnapshot } from '../lib/coupang-keyword-snapshot-api';
import {
  compareNaverDatalabSearchTrends,
  searchNaverAutocompleteKeywords,
  searchNaverDatalabPopularKeywords,
  searchNaverRelatedKeywords,
} from '../../recommendations/lib/naver-keyword-api';

const RUN_ID = '10000000-0000-4000-8000-000000000011';
const start = vi.fn(async () => ({ id: RUN_ID }));
let capturedOptions: Record<string, unknown> | null = null;

vi.mock('../lib/coupang-keyword-snapshot-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/coupang-keyword-snapshot-api')>();
  return {
    ...actual,
    fetchCoupangKeywordSuggestionSnapshot: vi.fn(async (keyword: string) => ({
      keyword,
      generatedAt: '2026-08-14T00:00:00.000Z',
      sourceKey: 'coupang.keyword_suggestion',
      schemaVersion: 'coupang-keyword-suggestion/v1',
      items: [],
      productNameTokens: [],
    })),
  };
});

vi.mock('../lib/coupang-keyword-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/coupang-keyword-extension')>();
  return { ...actual, searchCoupangKeywordSuggestions: vi.fn() };
});

vi.mock('../../hooks/use-sourcing-operation-action', () => ({
  useSourcingOperationAction: vi.fn((options: Record<string, unknown>) => {
    capturedOptions = options;
    return {
      runId: null,
      run: null,
      runQuery: { data: null },
      start,
      cancel: vi.fn(),
      retryAttention: vi.fn(),
      isStarting: false,
      isCancelling: false,
      isRetrying: false,
    };
  }),
}));

vi.mock('../../hooks/use-sourcing-workspace', () => {
  const query = {
    data: [],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(async () => ({ data: [], error: null })),
  };
  const mutation = {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };
  return {
    useSourcingKeywordPreferences: () => query,
    useSaveSourcingKeywordPreference: () => mutation,
    useSourcingInterestTargets: () => query,
    useSaveSourcingInterestTarget: () => mutation,
    useRemoveSourcingInterestTarget: () => mutation,
  };
});

vi.mock('../../recommendations/lib/naver-keyword-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../recommendations/lib/naver-keyword-api')>();
  return {
    ...actual,
    compareNaverDatalabSearchTrends: vi.fn(async () => ({ items: [] })),
    searchNaverAutocompleteKeywords: vi.fn(async () => ({ items: [] })),
    searchNaverDatalabPopularKeywords: vi.fn(async () => ({ boards: [] })),
    searchNaverRelatedKeywords: vi.fn(async () => ({ items: [] })),
  };
});

vi.mock('../lib/trend-keyword-agent', () => ({
  runTrendKeywordAgent: vi.fn(),
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <KeywordAnalysisPage />
    </QueryClientProvider>,
  );
}

describe('KeywordAnalysisPage browser operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
    window.history.replaceState(
      {},
      '',
      `/sourcing-ai/keywords?keyword=%EC%8A%AC%EB%9D%BC%EC%9E%84&operationRun=${RUN_ID}`,
    );
  });

  it('reconnects and reads the persisted keyword snapshot without starting providers', async () => {
    renderPage();

    await waitFor(() => {
      expect(fetchCoupangKeywordSuggestionSnapshot).toHaveBeenCalledWith('슬라임');
    });
    expect(start).not.toHaveBeenCalled();
    expect(searchCoupangKeywordSuggestions).not.toHaveBeenCalled();
    expect(searchNaverDatalabPopularKeywords).not.toHaveBeenCalled();
    expect(searchNaverAutocompleteKeywords).not.toHaveBeenCalled();
    expect(searchNaverRelatedKeywords).not.toHaveBeenCalled();
    expect(compareNaverDatalabSearchTrends).not.toHaveBeenCalled();
    expect(capturedOptions).toMatchObject({
      operationKey: 'sourcing.collect_keyword_suggestions',
      input: { keyword: '슬라임', maxResults: 30 },
      snapshotQueryKey: ['sourcing', 'keyword-suggestions', '슬라임'],
      initialRunId: RUN_ID,
    });
  });

  it('starts exactly one operation with the event keyword and never calls the legacy extension', async () => {
    renderPage();
    const input = screen.getByPlaceholderText('키워드를 입력해주세요');
    fireEvent.change(input, { target: { value: '  클레이  ' } });
    fireEvent.click(screen.getByRole('button', { name: '키워드 검색' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      { keyword: '클레이', maxResults: 30 },
      [['sourcing', 'keyword-suggestions', '클레이']],
    );
    expect(searchCoupangKeywordSuggestions).not.toHaveBeenCalled();
    expect(window.location.search).toContain(`operationRun=${RUN_ID}`);
    expect(window.location.search).toContain('keyword=%ED%81%B4%EB%A0%88%EC%9D%B4');
  });
});
