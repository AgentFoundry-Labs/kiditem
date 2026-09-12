import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  fetchCompetitorCatalogSourceStatus,
  fetchCompetitorTrackingOverview,
} from '../lib/competitor-tracking-api';
import {
  collectCompetitorCatalogFromExtension,
  detectCompetitorExtensionGate,
  requireCompetitorCatalogExtension,
} from '../lib/competitor-extension';
import { CompetitorTrackingPage } from './CompetitorTrackingPage';

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001';

const seller = {
  sellerKey: 'seller-key-1',
  sellerName: '판매자 A',
  brandName: null,
  sellerId: 'seller_123',
  sellerStoreUrl: 'https://shop.coupang.com/seller_123',
  sellerResolved: true,
  watchlisted: true,
  discoverySource: 'user' as const,
  priorityScore: 10,
  overlapProductCount: 1,
  matchedOwnProductCount: 1,
  trackedKeywordCount: 1,
  top10Count: 1,
  organicExposureCount: 1,
  averageRank: 1,
  totalReviewCount: 10,
  recentChangeCount: 0,
  lastCapturedAt: '2026-09-04T00:00:00.000Z',
  products: [],
  catalog: null,
};

function overview() {
  return {
    periodDays: 30,
    collection: {
      status: 'ready' as const,
      ownProductCount: 1,
      wingProductCount: 1,
      storefrontProductCount: 1,
      storefrontStatus: 'ready' as const,
      trackerCount: 1,
      enabledTrackerCount: 1,
      trackedKeywords: ['슬라임'],
      suggestedKeywords: [],
      watchedCompetitors: [],
      lastCapturedAt: '2026-09-04T00:00:00.000Z',
    },
    summary: {
      trackedSellerCount: 1,
      topSellerCount: 1,
      overlappingProductCount: 1,
      matchedOwnProductCount: 1,
      trackedKeywordCount: 1,
      unresolvedSellerProductCount: 0,
      lastCapturedAt: '2026-09-04T00:00:00.000Z',
    },
    sellers: [seller],
  };
}

function sourceStatus() {
  return {
    ready: true,
    latestAttempt: null,
    latestComplete: {
      sourceImportRunId: ATTEMPT_ID,
      coveredThrough: '2026-09-03',
      capturedAt: '2026-09-04T00:00:00.000Z',
      expectedTargetCount: 1,
      capturedTargetCount: 1,
      ignoredTargetCount: 0,
    },
  };
}

vi.mock('../lib/competitor-tracking-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/competitor-tracking-api')>();
  return {
    ...actual,
    fetchCompetitorTrackingOverview: vi.fn(),
    fetchCompetitorCatalogSourceStatus: vi.fn(),
  };
});

vi.mock('../lib/competitor-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/competitor-extension')>();
  return {
    ...actual,
    detectCompetitorExtensionGate: vi.fn(),
    requireCompetitorCatalogExtension: vi.fn(),
    collectCompetitorCatalogFromExtension: vi.fn(),
  };
});

vi.mock('../hooks/useCompetitorProductTracking', () => ({
  useCompetitorProductTracking: () => ({
    trackedProductIds: new Set<string>(),
    trackingProductId: null,
    trackingPending: false,
    trackProduct: vi.fn(),
  }),
}));

vi.mock('./CompetitorSellerList', () => ({
  CompetitorSellerList: ({ sellers, onCollectSeller }: {
    sellers: typeof seller[];
    onCollectSeller: (value: typeof seller) => void;
  }) => (
    <button type="button" onClick={() => onCollectSeller(sellers[0]!)}>
      판매자 A 수집
    </button>
  ),
}));

vi.mock('./CompetitorSellerDetail', () => ({
  CompetitorSellerDetail: () => <div>판매자 상세</div>,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CompetitorTrackingPage />
    </QueryClientProvider>,
  );
}

describe('CompetitorTrackingPage direct source owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchCompetitorTrackingOverview).mockResolvedValue(overview());
    vi.mocked(fetchCompetitorCatalogSourceStatus).mockResolvedValue(sourceStatus());
    vi.mocked(detectCompetitorExtensionGate).mockResolvedValue({
      status: 'ready', extensionId: 'extension-id', version: '1.0.0',
    });
    vi.mocked(requireCompetitorCatalogExtension).mockResolvedValue('extension-id');
    vi.mocked(collectCompetitorCatalogFromExtension).mockResolvedValue({
      success: true,
      attemptId: ATTEMPT_ID,
      terminalState: 'COMPLETE',
    });
  });

  it('uses the extension owner as the only begin caller for an all-target collection', async () => {
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 수집·갱신' }));

    await waitFor(() => expect(collectCompetitorCatalogFromExtension).toHaveBeenCalledWith({
      extensionId: 'extension-id',
      idempotencyKey: expect.any(String),
      input: { target: 'all' },
    }));
    expect(toast.success).toHaveBeenCalledWith('설정된 경쟁 판매자 수집을 완료했습니다.');
    const pageSource = readFileSync(resolve(__dirname, 'CompetitorTrackingPage.tsx'), 'utf8');
    expect(pageSource).not.toContain('beginCompetitorCatalogAttempt');
  });

  it('converges a replayed COMPLETE result returned by the extension owner', async () => {
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 수집·갱신' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('설정된 경쟁 판매자 수집을 완료했습니다.'));
    expect(requireCompetitorCatalogExtension).toHaveBeenCalledTimes(1);
    expect(collectCompetitorCatalogFromExtension).toHaveBeenCalledTimes(1);
  });

  it('keeps one idempotency key after an extension response loss', async () => {
    vi.mocked(collectCompetitorCatalogFromExtension)
      .mockRejectedValueOnce(new Error('extension response lost'))
      .mockResolvedValueOnce({
        success: true,
        attemptId: ATTEMPT_ID,
        terminalState: 'COMPLETE',
      });
    renderPage();
    await screen.findByText('판매자 상세');
    const collect = screen.getByRole('button', { name: '판매자 수집·갱신' });

    fireEvent.click(collect);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('extension response lost'));
    await waitFor(() => expect(collect).not.toBeDisabled());
    fireEvent.click(collect);

    await waitFor(() => expect(collectCompetitorCatalogFromExtension).toHaveBeenCalledTimes(2));
    expect(vi.mocked(collectCompetitorCatalogFromExtension).mock.calls[1]![0].idempotencyKey)
      .toBe(vi.mocked(collectCompetitorCatalogFromExtension).mock.calls[0]![0].idempotencyKey);
  });

  it('starts a seller-scoped attempt without transporting the seller store URL', async () => {
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 A 수집' }));

    await waitFor(() => expect(collectCompetitorCatalogFromExtension).toHaveBeenCalledWith({
      extensionId: 'extension-id',
      idempotencyKey: expect.any(String),
      input: { target: 'seller_id', sellerId: 'seller_123' },
    }));
    expect(JSON.stringify(vi.mocked(collectCompetitorCatalogFromExtension).mock.calls[0]![0]))
      .not.toContain('sellerStoreUrl');
  });

  it('does not send a direct owner begin when the extension gate rejects collection', async () => {
    vi.mocked(requireCompetitorCatalogExtension).mockRejectedValueOnce(
      new Error('KIDITEM 쿠팡 확장프로그램을 연결한 뒤 다시 시도해주세요.'),
    );
    renderPage();
    await screen.findByText('판매자 상세');

    fireEvent.click(screen.getByRole('button', { name: '판매자 수집·갱신' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'KIDITEM 쿠팡 확장프로그램을 연결한 뒤 다시 시도해주세요.',
    ));
    expect(collectCompetitorCatalogFromExtension).not.toHaveBeenCalled();
    const pageSource = readFileSync(resolve(__dirname, 'CompetitorTrackingPage.tsx'), 'utf8');
    expect(pageSource).not.toContain('/attempts');
  });

  it('shows stale failure details while retaining the last complete cutoff', async () => {
    vi.mocked(fetchCompetitorCatalogSourceStatus).mockResolvedValue({
      ...sourceStatus(),
      ready: false,
      latestAttempt: {
        attemptId: ATTEMPT_ID,
        state: 'FAILED',
        startedAt: '2026-09-04T00:00:00.000Z',
        capturedAt: null,
        expiresAt: '2026-09-04T01:00:00.000Z',
        errorCode: 'COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED',
        errorMessage: 'seller catalog failed',
      },
    });
    renderPage();

    await screen.findByText('판매자 상세');
    expect(screen.getByText(/마지막 수집 실패: COMPETITOR_CATALOG_TARGET_COLLECTION_FAILED/)).toBeInTheDocument();
    expect(screen.getByText(/seller catalog failed/)).toBeInTheDocument();
  });
});
