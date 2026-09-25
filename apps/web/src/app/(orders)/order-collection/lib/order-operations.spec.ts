import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OperationView } from '@kiditem/shared/operation';
import { apiClient } from '@/lib/api-client';
import { requestOperationStart } from '@/lib/operation-start';
import {
  ORDER_CAPTURE_OPERATION_CAPABILITY,
  orderOperationControl,
  startOrderOperation,
  waitForOrderOperation,
} from './order-operations';

vi.mock('@/lib/api-client', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/operation-start', () => ({ requestOperationStart: vi.fn(), requestOperationCancel: vi.fn() }));

const KIND = 'orders.sellpia_shipment_tracking' as const;
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function operation(id: string, status: OperationView['status'], patch: Partial<OperationView> = {}): OperationView {
  return {
    id,
    kind: KIND,
    status,
    lockKeys: status === 'executing' ? ['resource:sellpia:login'] : [],
    plan: { startDate: '2026-09-07', endDate: '2026-09-07' },
    progress: null,
    result: status === 'succeeded' ? { rowCount: 2 } : null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T00:00:00.000Z',
    finishedAt: status === 'executing' ? null : '2026-09-26T00:00:05.000Z',
    expiresAt: '2026-09-26T00:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...patch,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('order operations (KID-359 H3)', () => {
  it('시작은 orderCaptureOperationKindsV1 빌드에만 보내고 실행 id를 돌려준다 — 이미 도는 같은 실행이면 그 id, 거절이면 서버 문장', async () => {
    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'started', operationId: ID });
    await expect(startOrderOperation(KIND, { startDate: '2026-09-07', endDate: '2026-09-07' })).resolves.toBe(ID);
    expect(requestOperationStart).toHaveBeenCalledWith(KIND, { startDate: '2026-09-07', endDate: '2026-09-07' }, { capability: ORDER_CAPTURE_OPERATION_CAPABILITY });

    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'running', operationId: OTHER });
    await expect(startOrderOperation(KIND, {})).resolves.toBe(OTHER);

    vi.mocked(requestOperationStart).mockResolvedValueOnce({ outcome: 'refused', message: '같은 실행이 이미 진행 중입니다.' });
    await expect(startOrderOperation(KIND, {})).rejects.toThrow('같은 실행이 이미 진행 중입니다.');
  });

  it('끝날 때까지 reader를 읽어 그 실행의 마지막 모습을 돌려준다(다른 실행은 보지 않는다)', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ operations: [operation(OTHER, 'succeeded'), operation(ID, 'executing')] })
      .mockResolvedValueOnce({ operations: [operation(ID, 'succeeded')] });
    const sleeps: number[] = [];
    const finished = await waitForOrderOperation(KIND, ID, { sleep: async (ms) => { sleeps.push(ms); }, timeoutMs: 60_000 });
    expect(finished).toMatchObject({ id: ID, status: 'succeeded', result: { rowCount: 2 } });
    expect(apiClient.get).toHaveBeenCalledWith(`/api/operations?kinds=${KIND}&limit=20`);
    expect(sleeps).toEqual([2_000]);
  });

  it('실패·중단은 운영자 문장으로 던지고, 상한을 넘기면 아직 끝나지 않았다고 알린다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      operations: [operation(ID, 'failed', { errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: '셀피아 로그인이 필요합니다. 열려 있는 셀피아 탭에서 로그인한 뒤 다시 조회해 주세요.' })],
    });
    await expect(waitForOrderOperation(KIND, ID, { sleep: async () => undefined, timeoutMs: 60_000 })).rejects.toThrow('셀피아 로그인이 필요합니다');

    vi.mocked(apiClient.get).mockResolvedValueOnce({ operations: [operation(ID, 'cancelled', { errorCode: 'USER_CANCELLED' })] });
    await expect(waitForOrderOperation(KIND, ID, { sleep: async () => undefined, timeoutMs: 60_000 })).rejects.toThrow('중단');

    let now = 0;
    vi.mocked(apiClient.get).mockResolvedValue({ operations: [operation(ID, 'executing')] });
    await expect(waitForOrderOperation(KIND, ID, { sleep: async (ms) => { now += ms; }, now: () => now, timeoutMs: 5_000 }))
      .rejects.toThrow('아직 끝나지 않았습니다');
  });

  it('공용 컨트롤: 도는 실행·마지막 성공을 reader에서 읽고, 중단은 확장 → 서버 cancel', async () => {
    const control = orderOperationControl({ kind: KIND, sourceKey: KIND, label: '셀피아 송장 조회' });
    const status = { operations: [operation(ID, 'executing'), operation(OTHER, 'succeeded')] };
    expect(control.readRunning(status)).toEqual({ attemptId: ID, scopeLabel: null });
    expect(control.readCompleteId(status)).toBe(OTHER);
    expect(control.start).toBeUndefined();
    await control.cancelOnServer?.(ID, { status });
    expect(apiClient.post).toHaveBeenCalledWith(`/api/operations/${ID}/cancel`);
  });
});
