import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeywordAnalysisPage } from './KeywordAnalysisPage';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import {
  fetchKeywordAnalysisSnapshot,
  keywordAnalysisInput,
} from '../../lib/keyword-analysis-snapshot-api';

const RUN_ID = '10000000-0000-4000-8000-000000000011';
const start = vi.fn(async () => ({ id: RUN_ID }));
let capturedOptions: Record<string, unknown> | null = null;

vi.mock('../../lib/keyword-analysis-snapshot-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/keyword-analysis-snapshot-api')>();
  return {
    ...actual,
    fetchKeywordAnalysisSnapshot: vi.fn(async (input: unknown) => ({
      version: 'naver-keyword-analysis/v1',
      generatedAt: '2026-08-14T00:00:00.000Z',
      input,
      result: { popular: null, related: null, autocomplete: [], trends: null },
    })),
  };
});

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

describe('KeywordAnalysisPage operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = null;
    window.history.replaceState(
      {},
      '',
      `/sourcing-ai/keywords?keyword=%EC%8A%AC%EB%9D%BC%EC%9E%84&operationRun=${RUN_ID}`,
    );
  });

  it('reads the persisted Naver snapshot on mount without starting provider work', async () => {
    renderPage();

    await waitFor(() => expect(fetchKeywordAnalysisSnapshot).toHaveBeenCalledWith(
      keywordAnalysisInput('trend_agent'),
    ));
    expect(start).not.toHaveBeenCalled();
    expect(capturedOptions).toMatchObject({
      operationKey: 'sourcing.collect_keyword_analysis',
      input: keywordAnalysisInput('trend_agent'),
      initialRunId: RUN_ID,
    });
  });

  it('starts exactly one persisted Naver operation for an explicit keyword search', async () => {
    renderPage();
    const input = screen.getByPlaceholderText('키워드를 입력해주세요');
    fireEvent.change(input, { target: { value: '  클레이  ' } });
    fireEvent.click(screen.getByRole('button', { name: '키워드 검색' }));

    const expected = keywordAnalysisInput('related', { keyword: '클레이' });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith(
      expected,
      [['sourcing', 'keyword-analysis', 'snapshot', JSON.stringify(expected)]],
    );
  });

  it('starts one exact persisted Naver operation from the explicit trend-agent CTA', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '트렌드 찾기' }));

    const expected = keywordAnalysisInput('trend_agent');
    await waitFor(() => expect(start).toHaveBeenCalledWith(
      expected,
      [['sourcing', 'keyword-analysis', 'snapshot', JSON.stringify(expected)]],
    ));
  });
});
