import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { refetchWingCatalogProduct, wingCatalogCollection } from './wing-catalog-collection';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), getParsed: vi.fn(), fetchRaw: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const ACCOUNT_ID = '5f0c2f7e-7a9e-4f3f-9d61-0a4b2b8f1c11';
const OPERATION_ID = '11111111-1111-4111-8111-111111111111';
const CREDENTIALS = { loginId: 'fake-wing-id', password: 'fake-wing-password' };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
  vi.mocked(apiClient.get).mockImplementation(async (path: string) => {
    if (path === '/api/orders/collection/malls/coupang/password') return { key: 'coupang', loginId: 'fake-wing-id', supplierLoginId: null, password: 'fake-wing-password' };
    throw new Error(`unexpected GET ${path}`);
  });
});

describe('윙 카탈로그 실행은 윙 저장 자격을 싣는다(KID-377)', () => {
  it('상품 받기(목록 → 상세 연쇄)는 대표 윙 계정의 저장 자격으로 시작한다', async () => {
    const adapter = wingCatalogCollection({ id: ACCOUNT_ID, name: '윙 계정' });
    await expect(adapter.start!(undefined as never, { status: undefined })).resolves.toEqual({ outcome: 'started', attemptId: OPERATION_ID });
    expect(requestOperationStart).toHaveBeenCalledWith('channels.wing_catalog_list', { channelAccountId: ACCOUNT_ID }, { credentials: CREDENTIALS });
  });

  it('상품 하나 상세 다시 받기도 같은 자격을 싣고, 저장 자격이 없으면 자격 없이 시작한다', async () => {
    await refetchWingCatalogProduct(ACCOUNT_ID, '9001');
    expect(requestOperationStart).toHaveBeenLastCalledWith('channels.wing_catalog_details', {
      channelAccountId: ACCOUNT_ID,
      detailTargetProductIds: ['9001'],
      absentProductIds: [],
    }, { credentials: CREDENTIALS });

    vi.mocked(apiClient.get).mockResolvedValue({ key: 'coupang', loginId: null, supplierLoginId: null, password: null });
    await refetchWingCatalogProduct(ACCOUNT_ID, '9002');
    expect(vi.mocked(requestOperationStart).mock.lastCall![2]).toEqual({});
  });
});
