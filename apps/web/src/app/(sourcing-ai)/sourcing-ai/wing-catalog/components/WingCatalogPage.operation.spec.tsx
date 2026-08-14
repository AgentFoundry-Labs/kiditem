import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WingCatalogPage } from './WingCatalogPage';
import { fetchWingCatalogSnapshot } from '../lib/wing-catalog-api';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';
import { searchNaverRelatedKeywords } from '../../recommendations/lib/naver-keyword-api';

const start = vi.fn(async () => ({
  id: '10000000-0000-4000-8000-000000000001',
}));
let capturedOptions: Record<string, unknown> | null = null;

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

vi.mock('../../lib/wing-tracking-api', () => ({
  listWingTrackedProducts: vi.fn(async () => []),
  addWingTrackedProduct: vi.fn(),
}));

vi.mock('../../recommendations/lib/naver-keyword-api', () => ({
  searchNaverRelatedKeywords: vi.fn(async () => ({ items: [] })),
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
    capturedOptions = null;
    window.history.replaceState({}, '', '/sourcing-ai/wing-catalog');
  });

  it('reads the persisted snapshot on mount without starting browser work', async () => {
    renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('슬라임'));
    await screen.findByText(/0개 상품 · persisted_snapshot/);
    expect(start).not.toHaveBeenCalled();
    expect(searchNaverRelatedKeywords).not.toHaveBeenCalled();
    expect(capturedOptions).toMatchObject({
      operationKey: 'sourcing.collect_wing_catalog_batch',
      input: { keywords: ['슬라임'], maxPages: 2, purpose: 'catalog_search' },
      snapshotQueryKey: ['sourcing', 'wing-catalog', '슬라임'],
    });
  });

  it('does not contact providers or start work while resolving, reconnecting, or reloading the route', async () => {
    const initial = renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('슬라임'));
    await screen.findByText(/0개 상품 · persisted_snapshot/);
    expect(searchNaverRelatedKeywords).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();

    initial.unmount();
    window.history.replaceState(
      {},
      '',
      '/sourcing-ai/wing-catalog?keyword=%ED%81%B4%EB%A0%88%EC%9D%B4&operationRun=10000000-0000-4000-8000-000000000002',
    );
    renderPage();

    await waitFor(() => expect(fetchWingCatalogSnapshot).toHaveBeenCalledWith('클레이'));
    await screen.findByText(/0개 상품 · persisted_snapshot/);
    expect(searchNaverRelatedKeywords).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(useSourcingOperationAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        initialRunId: '10000000-0000-4000-8000-000000000002',
      }),
    );
  });

  it('starts one durable operation from the explicit CTA', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('키워드 입력'), {
      target: { value: '클레이' },
    });
    fireEvent.click(screen.getByRole('button', { name: '분석' }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(useSourcingOperationAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        operationKey: 'sourcing.collect_wing_catalog_batch',
        input: { keywords: ['클레이'], maxPages: 2, purpose: 'catalog_search' },
      }),
    );
    expect(window.location.search).toContain(
      'operationRun=10000000-0000-4000-8000-000000000001',
    );
    expect(window.location.search).toContain('keyword=%ED%81%B4%EB%A0%88%EC%9D%B4');
  });

  it('contacts the related-keyword provider only from its explicit operator action', async () => {
    renderPage();
    await screen.findByText(/0개 상품 · persisted_snapshot/);

    fireEvent.click(screen.getByRole('button', { name: '네이버 연관 키워드 조회' }));

    await waitFor(() => {
      expect(searchNaverRelatedKeywords).toHaveBeenCalledWith({
        seedKeywords: ['슬라임'],
        maxResults: 30,
      });
    });
    expect(start).not.toHaveBeenCalled();
  });
});
