import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { detectBrowserCollectionExtensionIds, detectExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { CoupangCatalogExcelRefresh } from './CoupangCatalogExcelRefresh';

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { organizationId: 'org-1' } }) }));
vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/extension-bridge', () => ({
  detectExtensionId: vi.fn(),
  detectBrowserCollectionExtensionIds: vi.fn(),
  detectOrderCollectionExtensionId: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

const ACCOUNT_ID = '71111111-1111-4111-8111-111111111111';
const EXCEL_ID = '7a333333-3333-4333-8333-333333333333';
const OPERATIONS_PATH =
  '/api/operations?kinds=channels.wing_catalog_list,channels.wing_catalog_details,channels.wing_catalog_excel&limit=5';

let serverOperations: OperationView[];

function excelOperation(overrides: Partial<OperationView> = {}): OperationView {
  return {
    id: EXCEL_ID,
    kind: 'channels.wing_catalog_excel',
    status: 'executing',
    lockKeys: [`account:${ACCOUNT_ID}`],
    plan: { channelAccountId: ACCOUNT_ID, startedBy: null },
    progress: { status: 'CREATING', executeCount: 500, totalCount: 1260 },
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

function renderRefresh() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CoupangCatalogExcelRefresh channelAccountId={ACCOUNT_ID} accountName="키드아이템 스토어" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  serverOperations = [];
  vi.mocked(detectExtensionId).mockResolvedValue('ext');
  vi.mocked(detectBrowserCollectionExtensionIds).mockResolvedValue(['ext']);
  vi.mocked(sendToExtension).mockImplementation(async (_id, message) => {
    const action = (message as { action: string }).action;
    if (action === 'ping') return { success: true, capabilities: { kiditemEnvironmentProfilesV1: true, operationRuntime: true } };
    if (action === 'setAuthToken') return { success: true };
    if (action === 'operation.start') {
      serverOperations = [excelOperation()];
      return { success: true, operationId: EXCEL_ID, reused: false };
    }
    throw new Error(`unexpected ${action}`);
  });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === OPERATIONS_PATH) return { operations: serverOperations };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.mocked(apiClient.post).mockImplementation(async (path: string) => {
    if (path === '/api/auth/extension-handoff') return { token: 'a'.repeat(43) };
    throw new Error(`unexpected POST ${path}`);
  });
});

describe('쿠팡상품정보 갱신 (KID-351 작업 ②)', () => {
  it('starts the workbook operation through the extension and shows Wing creation progress and the sync block', async () => {
    renderRefresh();

    fireEvent.click(await screen.findByRole('button', { name: '쿠팡상품정보 갱신' }));

    expect(await screen.findByText('쿠팡상품정보 엑셀 만드는 중')).toBeInTheDocument();
    expect(screen.getByText('500 / 1,260')).toBeInTheDocument();
    expect(screen.getByText('엑셀 생성 중에는 상품 받기(동기화)를 시작할 수 없습니다.')).toBeInTheDocument();
    expect(vi.mocked(sendToExtension).mock.calls.map(([, message]) => message).filter((message) => (message as { action: string }).action === 'operation.start'))
      .toEqual([{ action: 'operation.start', kind: 'channels.wing_catalog_excel', scope: { channelAccountId: ACCOUNT_ID } }]);
  });

  it('reports the applied counts once the workbook operation succeeded', async () => {
    serverOperations = [excelOperation({
      status: 'succeeded',
      lockKeys: [],
      finishedAt: '2026-09-25T00:07:00.000Z',
      result: { createdProductCount: 1, updatedProductCount: 9, createdSkuCount: 2, updatedSkuCount: 18, skippedRowCount: 0 },
    })];
    renderRefresh();

    expect(await screen.findByText('쿠팡상품정보 반영 · 상품 10개 · 옵션 20개')).toBeInTheDocument();
    expect(screen.queryByText(/엑셀 생성 중에는/)).not.toBeInTheDocument();
  });
});
