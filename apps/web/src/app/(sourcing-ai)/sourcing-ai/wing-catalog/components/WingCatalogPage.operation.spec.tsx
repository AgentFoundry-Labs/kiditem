import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WingCatalogPage } from './WingCatalogPage';
import { fetchWingCatalogSnapshot } from '../lib/wing-catalog-api';
import { searchWingCatalogProducts } from '../lib/wing-catalog-extension';
import { useSourcingOperationAction } from '../../hooks/use-sourcing-operation-action';

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

vi.mock('../lib/wing-catalog-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/wing-catalog-extension')>();
  return { ...actual, searchWingCatalogProducts: vi.fn() };
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
    expect(start).not.toHaveBeenCalled();
    expect(searchWingCatalogProducts).not.toHaveBeenCalled();
    expect(capturedOptions).toMatchObject({
      operationKey: 'sourcing.collect_wing_catalog_batch',
      input: { keywords: ['슬라임'], maxPages: 2, purpose: 'catalog_search' },
      snapshotQueryKey: ['sourcing', 'wing-catalog', '슬라임'],
    });
  });

  it('starts one durable operation from the explicit CTA and never calls the direct extension helper', async () => {
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
    expect(searchWingCatalogProducts).not.toHaveBeenCalled();
    expect(window.location.search).toContain(
      'operationRun=10000000-0000-4000-8000-000000000001',
    );
    expect(window.location.search).toContain('keyword=%ED%81%B4%EB%A0%88%EC%9D%B4');
  });
});
