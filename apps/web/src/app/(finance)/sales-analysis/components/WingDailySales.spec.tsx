import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { SELLPIA_OPERATION_PING, sellpiaOperation } from '@/test/fixtures/sellpia-operations';
import WingDailySales from './WingDailySales';

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), getParsed: vi.fn(), post: vi.fn() },
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectBrowserCollectionExtensionIds: vi.fn(async () => []),
  detectExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));
// The retired path collected Wing daily sales through the readiness hook.
vi.mock('@/components/readiness/useReadinessCollection', () => ({
  useReadinessCollection: () => {
    throw new Error('Wing daily sales must not collect through the readiness hook');
  },
}));

const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const OPERATIONS_PATH = '/api/operations?kinds=analytics.sellpia_sales&limit=20';
const RANGE = { from: '2026-07-12', to: '2026-07-15' };

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

let operations: OperationView[];

function renderDailySales(ui: ReactNode = <WingDailySales />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  operations = [];
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(sendToExtension).mockImplementation(async (_extensionId, message) => {
    const action = (message as { action: string }).action;
    if (action === 'ping') return SELLPIA_OPERATION_PING;
    if (action === 'operation.start') {
      operations = [sellpiaOperation({ id: OPERATION_ID, kind: 'analytics.sellpia_sales', window: { start: RANGE.from, end: RANGE.to } })];
      return { success: true, operationId: OPERATION_ID, reused: false };
    }
    throw new Error(`unexpected ${action}`);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path.startsWith('/api/traffic/monthly')) return monthly;
    if (path === '/api/readiness') return readiness;
    if (path === OPERATIONS_PATH) return { operations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    throw new Error(`unexpected POST ${path}`);
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
    expect(sendToExtension).toHaveBeenCalledWith(
      'ext',
      { action: 'operation.start', kind: 'analytics.sellpia_sales', scope: { startDate: RANGE.from, endDate: RANGE.to } },
      60_000,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
