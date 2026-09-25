import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCoupangShipmentSummary,
  readLatestCoupangShipmentSummary,
  startCoupangShipmentSummary,
} from '../coupang-shipment-summary-operation';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), getParsed: vi.fn() }));
const start = vi.hoisted(() => ({ requestOperationStart: vi.fn() }));
vi.mock('../api-client', () => ({ apiClient: api }));
vi.mock('../operation-start', () => start);

const OPERATION_ID = 'a1111111-1111-4111-8111-111111111111';

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'orders.coupang_shipment_summary',
    status: 'executing',
    lockKeys: ['org'],
    plan: { maxPages: 40 },
    progress: { current: 6, total: 40, done: false },
    result: null,
    window: null,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-26T01:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-26T01:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

describe('쿠팡 쉽먼트 발송일 조회 웹 다리(실행 계약 orders.coupang_shipment_summary)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('확장에 빈 scope로 실행을 시작시킨다(쪽 상한은 서버 plan이 정한다)', async () => {
    start.requestOperationStart.mockResolvedValue({ outcome: 'started', operationId: OPERATION_ID });
    await expect(startCoupangShipmentSummary()).resolves.toEqual({ outcome: 'started', operationId: OPERATION_ID });
    expect(start.requestOperationStart).toHaveBeenCalledWith('orders.coupang_shipment_summary', {});
  });

  it('가장 최근 실행을 진행(쪽)·결과·실패 문장으로 읽는다', async () => {
    api.get.mockResolvedValueOnce({ operations: [] });
    await expect(readLatestCoupangShipmentSummary()).resolves.toEqual({ status: 'idle' });
    expect(api.get).toHaveBeenCalledWith('/api/operations?kinds=orders.coupang_shipment_summary&limit=5');

    api.get.mockResolvedValueOnce({ operations: [operation()] });
    await expect(readLatestCoupangShipmentSummary()).resolves.toMatchObject({ status: 'running', current: 6, total: 40, dates: null });

    api.get.mockResolvedValueOnce({
      operations: [operation({ status: 'succeeded', result: { dates: 3, rows: 11 }, progress: { current: 2, total: 40, done: true }, finishedAt: '2026-09-26T01:01:00.000Z' })],
    });
    await expect(readLatestCoupangShipmentSummary()).resolves.toMatchObject({ status: 'done', dates: 3, rows: 11, finishedAt: '2026-09-26T01:01:00.000Z' });

    api.get.mockResolvedValueOnce({
      operations: [operation({ status: 'failed', errorCode: 'SITE_COOKIE_BLOAT', errorMessage: '쿠팡 쿠키를 정리하세요.' })],
    });
    await expect(readLatestCoupangShipmentSummary()).resolves.toMatchObject({ status: 'error', errorCode: 'SITE_COOKIE_BLOAT', error: '쿠팡 쿠키를 정리하세요.' });
  });

  it('중단은 실행 계약의 cancel', async () => {
    await cancelCoupangShipmentSummary(OPERATION_ID);
    expect(api.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
  });
});
