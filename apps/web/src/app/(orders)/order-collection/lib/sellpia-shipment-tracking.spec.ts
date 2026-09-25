import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import { collectSellpiaShipmentTracking } from './sellpia-shipment-tracking';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), fetchRaw: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));

const ID = '11111111-1111-4111-8111-111111111111';
const DATE = '2026-09-07';
const ROW = { ordNo: 'ORDER-1', itemNo: '', invNo: 'INV-1', courier: '1136', provider: '스마트스토어', receiver: '홍길동', post: '06000', addr: '서울' };

function operation(status: 'executing' | 'succeeded' | 'failed', patch: Record<string, unknown> = {}) {
  return {
    id: ID,
    kind: 'orders.sellpia_shipment_tracking',
    status,
    lockKeys: [],
    plan: { startDate: DATE, endDate: DATE },
    progress: null,
    result: status === 'succeeded' ? { rowCount: 1 } : null,
    window: { start: DATE, end: DATE },
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

const sleep = async () => undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestOperationStart).mockResolvedValue({ outcome: 'started', operationId: ID });
});

describe('collectSellpiaShipmentTracking (orders.sellpia_shipment_tracking)', () => {
  it('그날 하루를 조회하는 실행을 시작하고, 성공하면 실행 id로 보관 캡처를 내려받아 송장 행을 돌려준다', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ operations: [operation('executing')] })
      .mockResolvedValueOnce({ operations: [operation('succeeded')] });
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(Response.json({ rows: [ROW], total: 3, range: { start: DATE, end: DATE }, confirmedRange: null }));

    await expect(collectSellpiaShipmentTracking(DATE, { sleep })).resolves.toEqual([ROW]);
    expect(requestOperationStart).toHaveBeenCalledWith('orders.sellpia_shipment_tracking', { startDate: DATE, endDate: DATE }, { capability: 'orderCaptureOperationKindsV1' });
    expect(apiClient.fetchRaw).toHaveBeenCalledWith(`/api/orders/sellpia-shipment-tracking/${ID}/source`);
  });

  it('실패한 실행은 그 문장으로, 캡처의 조회 기간이 요청과 다르면 거절한다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      operations: [operation('failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다.' })],
    });
    await expect(collectSellpiaShipmentTracking(DATE, { sleep })).rejects.toThrow('셀피아 로그인이 필요합니다.');

    vi.mocked(apiClient.get).mockResolvedValueOnce({ operations: [operation('succeeded')] });
    vi.mocked(apiClient.fetchRaw).mockResolvedValue(Response.json({ rows: [ROW], total: 1, range: { start: '2026-09-06', end: DATE }, confirmedRange: null }));
    await expect(collectSellpiaShipmentTracking(DATE, { sleep })).rejects.toThrow('조회 기간');
  });
});
