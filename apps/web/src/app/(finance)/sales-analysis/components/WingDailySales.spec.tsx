import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import WingDailySales from './WingDailySales';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(async () => []),
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
// The retired path collected Wing daily sales through the readiness hook.
vi.mock('@/components/readiness/useReadinessCollection', () => ({
  useReadinessCollection: () => {
    throw new Error('Wing daily sales must not collect through the readiness hook');
  },
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_PATH = '/api/sellpia-sales/source';
const BEGIN_PATH = '/api/sellpia-sales/attempts';
const RANGE = { from: '2026-07-12', to: '2026-07-15' };
const BUSINESS_DATES = ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'];

const plan = {
  sourceType: 'sellpia_sales_daily',
  parserVersion: 'sellpia-sales-v1',
  sourceOrigin: 'https://kiditem.sellpia.com',
  sourcePath: '/sale_summary.html?mode=main_link',
  sourceAccountKey: 'kiditem',
  range: RANGE,
  businessDates: BUSINESS_DATES,
};

const readiness = {
  checks: [
    {
      key: 'wing_sales',
      label: 'Wing 매출',
      basis: {
        asOf: null,
        requiredAsOf: '2026-07-14',
        observedAt: null,
        sources: ['sellpia_orders'],
        measured: false,
        withheldCount: 0,
      },
      detail: '어제 매출 데이터 없음',
      lastSyncedAt: null,
      count: null,
      referenceDate: '2026-07-14',
      expectedDates: ['2026-07-12', '2026-07-13', '2026-07-14'],
      missingDates: ['2026-07-14', '2026-07-12'],
    },
  ],
};

const monthly = {
  year: 2026,
  month: 7,
  days: [],
  total: { revenue: null, orders: null, salesQty: null, visitors: null, views: null, cartAdds: null },
  averageDailyVisitors: null,
  coverage: { targetDays: 0, completedDays: 0, missingDates: [] },
};

let source: Record<string, unknown>;

function renderDailySales(ui: ReactNode = <WingDailySales />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  source = { latestAttempt: null, latestComplete: null };
  vi.mocked(detectOrderCollectionExtensionId).mockResolvedValue('sellpia-extension');
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) =>
    extensionSessionReply(message) ?? new Promise(() => undefined));
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/traffic/monthly')) return monthly;
    if (path === '/api/readiness') return readiness;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.getParsed).mockImplementation(async (path: string) => {
    if (path === SOURCE_PATH) return source;
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path !== BEGIN_PATH) throw new Error(`unexpected POST ${path}`);
    source = {
      latestAttempt: {
        attemptId: ATTEMPT_ID,
        state: 'RUNNING',
        plan,
        expiresAt: '2099-01-01T00:00:00.000Z',
        errorCode: null,
        errorMessage: null,
      },
      latestComplete: null,
    };
    return {
      attemptId: ATTEMPT_ID,
      sourceType: 'sellpia_sales_daily',
      state: 'RUNNING',
      expiresAt: '2099-01-01T00:00:00.000Z',
      plan,
      actualCutoffAt: null,
      completedAt: null,
      contentChecksum: null,
      contentByteCount: null,
      rowCount: 0,
      sellerCount: 0,
      businessDates: BUSINESS_DATES,
      errorCode: null,
      errorMessage: null,
    };
  });
});

describe('WingDailySales collection', () => {
  it("collects the readiness check's missing Sellpia sales dates through the shared control", async () => {
    renderDailySales();
    const start = await screen.findByRole('button', { name: '매출 받기' });
    await waitFor(() => expect(start).toBeEnabled());
    expect(screen.getByText('누락 2일')).toBeInTheDocument();

    fireEvent.click(start);

    expect(await screen.findByText('수집 중 · 2026-07-12 ~ 2026-07-15')).toBeInTheDocument();
    expect(vi.mocked(apiClient.post).mock.calls).toEqual([[
      BEGIN_PATH,
      { range: RANGE },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    ]]);
    expect(sendToExtension).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaSaleSummary', attemptId: ATTEMPT_ID },
      190_000,
    );
  });
});
