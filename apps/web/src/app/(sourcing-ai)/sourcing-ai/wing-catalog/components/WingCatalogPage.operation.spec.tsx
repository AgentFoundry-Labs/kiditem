import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WingCatalogPage } from './WingCatalogPage';
import { fetchWingCatalogSnapshot } from '../lib/wing-catalog-api';
import { useNaverAnalysisSource } from '../../hooks/use-naver-analysis-source';
import {
  fetchKeywordAnalysisSnapshot,
  keywordAnalysisInput,
} from '../../lib/keyword-analysis-snapshot-api';

const catalogStart = vi.fn(async () => ({
  attemptId: '10000000-0000-4000-8000-000000000001',
}));
const naverStart = vi.fn(async () => ({
  id: '10000000-0000-4000-8000-000000000002',
}));
let capturedOptions = new Map<string, Record<string, unknown>>();

vi.mock('../lib/wing-catalog-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/wing-catalog-api')>();
  return {
    ...actual,
    fetchWingCatalogSnapshot: vi.fn(async (keyword: string) => ({
      keyword,
      generatedAt: '2026-08-14T00:00:00.000Z',
      rejectedCount: 0,
      items: [],
    })),
  };
});

vi.mock('../../lib/keyword-analysis-snapshot-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/keyword-analysis-snapshot-api')>();
  return {
    ...actual,
    fetchKeywordAnalysisSnapshot: vi.fn(async () => null),
  };
});

vi.mock('../../hooks/use-wing-catalog-source', () => ({
  useWingCatalogSource: vi.fn((options: Record<string, unknown>) => {
    capturedOptions.set('wing-source', options);
    return { attempt: null, start: catalogStart, cancel: vi.fn(), isStarting: false,
      isRunning: false, isCancelling: false, error: null };
  }),
}));

vi.mock('../../hooks/use-naver-analysis-source', () => ({
  useNaverAnalysisSource: vi.fn((options: Record<string, unknown>) => {
    capturedOptions.set('naver-source', options);
    return {
      runId: null,
      run: null,
      runQuery: { data: null },
      collect: naverStart, error: null, actualCutoffAt: null,
      cancel: vi.fn(),
      retryAttention: vi.fn(),
      isCollecting: false,
      isCancelling: false,
      isRetrying: false,
    };
  }),
}));

vi.mock('../../lib/wing-tracking-api', () => ({
  listWingTrackedProducts: vi.fn(async () => []),
  addWingTrackedProduct: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/extension-bridge')>();
  return { ...actual, isChromeExtensionRuntimeAvailable: vi.fn(() => true) };
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WingCatalogPage />
    </QueryClientProvider>,
  );
}

describe('WingCatalogPage browser operation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOptions = new Map();
    window.history.replaceState({}, '', '/sourcing-ai/wing-catalog');
  });

  it('reads persisted snapshots on mount without starting browser or Naver provider work', async () => {
    renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('슬라임'));
    await waitFor(() => expect(fetchKeywordAnalysisSnapshot).toHaveBeenCalledWith(
      keywordAnalysisInput('related', { keyword: '슬라임' }),
    ));
    await screen.findByText(/0개 상품 · persisted_snapshot/);
    expect(catalogStart).not.toHaveBeenCalled();
    expect(naverStart).not.toHaveBeenCalled();
    expect(capturedOptions.get('wing-source')).toMatchObject({
      input: { keywords: ['슬라임'], maxPages: 2, purpose: 'catalog_search' },
    });
    expect(capturedOptions.get('naver-source')).toMatchObject({
      input: keywordAnalysisInput('related', { keyword: '슬라임' }),
    });
  });

  it('does not start work while resolving, reconnecting, or reloading the route', async () => {
    const initial = renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('슬라임'));
    expect(catalogStart).not.toHaveBeenCalled();
    expect(naverStart).not.toHaveBeenCalled();

    initial.unmount();
    window.history.replaceState(
      {},
      '',
      '/sourcing-ai/wing-catalog?keyword=%ED%81%B4%EB%A0%88%EC%9D%B4&sourceAttempt=10000000-0000-4000-8000-000000000002',
    );
    renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('클레이'));
    expect(catalogStart).not.toHaveBeenCalled();
    expect(naverStart).not.toHaveBeenCalled();
  });

  it('starts one durable catalog operation from the explicit CTA', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('키워드 입력'), {
      target: { value: '클레이' },
    });
    fireEvent.click(screen.getByRole('button', { name: '분석' }));

    await waitFor(() => expect(catalogStart).toHaveBeenCalledTimes(1));
    expect(capturedOptions.get('wing-source')).toMatchObject({
      input: { keywords: ['클레이'], maxPages: 2, purpose: 'catalog_search' },
    });
  });

  it('starts one exact Naver operation only from its explicit operator action', async () => {
    renderPage();
    await screen.findByText(/0개 상품 · persisted_snapshot/);
    await waitFor(() => expect(fetchKeywordAnalysisSnapshot).toHaveBeenCalledWith(
      keywordAnalysisInput('related', { keyword: '슬라임' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: '네이버 연관 키워드 조회' }));

    await waitFor(() => expect(naverStart).toHaveBeenCalledTimes(1));
    expect(catalogStart).not.toHaveBeenCalled();
  });
});
