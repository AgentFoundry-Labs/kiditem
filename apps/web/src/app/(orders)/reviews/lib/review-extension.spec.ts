import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelCoupangReviewCollection,
  detectReviewExtensionGate,
  readLatestCoupangReviewCollection,
  resolveCoupangReviewAccountId,
  startCoupangReviewCollection,
} from './review-extension';

const bridge = vi.hoisted(() => ({
  detectExtensionId: vi.fn(),
  isChromeExtensionRuntimeAvailable: vi.fn(),
  sendToExtension: vi.fn(),
}));
const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/api-client', () => ({ apiClient: api }));

const OPERATION_ID = 'a1111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'c1111111-1111-4111-8111-111111111111';
const WINDOWS = [
  { index: 0, label: '2026-09', start: '2026-09-01T00:00:00+09:00', end: '2026-09-25T23:59:59+09:00' },
  { index: 1, label: '2026-08', start: '2026-08-01T00:00:00+09:00', end: '2026-08-31T23:59:59+09:00' },
  { index: 2, label: '2026-07', start: '2026-07-01T00:00:00+09:00', end: '2026-07-31T23:59:59+09:00' },
];

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: OPERATION_ID,
    kind: 'orders.coupang_reviews',
    status: 'executing',
    lockKeys: [`account:${ACCOUNT_ID}`],
    plan: { channelAccountId: ACCOUNT_ID, windows: WINDOWS, maxPagesPerWindow: 40 },
    progress: {
      current: '2026-08',
      windows: [
        { index: 0, pages: 3, items: 120, done: true },
        { index: 1, pages: 1, items: 30, done: false },
      ],
    },
    result: null,
    window: { start: '2026-07-01', end: '2026-09-25' },
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-09-25T10:00:00.000Z',
    finishedAt: null,
    expiresAt: '2026-09-25T10:30:00.000Z',
    attempts: 1,
    maxAttempts: 1,
    scheduledFor: null,
    ...overrides,
  };
}

describe('쿠팡 상품평 수집 웹 다리(실행 계약 orders.coupang_reviews)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.isChromeExtensionRuntimeAvailable.mockReturnValue(true);
  });

  it('확장이 새 실행 런타임(operationRuntime)을 알릴 때만 준비된 것으로 본다', async () => {
    bridge.detectExtensionId.mockResolvedValue('ext');
    bridge.sendToExtension.mockResolvedValueOnce({ success: true, version: '1.0.0', capabilities: { coupangReviewCollection: true } });
    await expect(detectReviewExtensionGate()).resolves.toMatchObject({ status: 'outdated' });
    bridge.sendToExtension.mockResolvedValueOnce({ success: true, version: '1.0.0', capabilities: { operationRuntime: true } });
    await expect(detectReviewExtensionGate()).resolves.toEqual({ status: 'ready', extensionId: 'ext', version: '1.0.0' });
  });

  it('수집 계정은 활성 쿠팡 계정 중 대표 계정, 없으면 첫 계정 — 없으면 안내 문장으로 거절', async () => {
    const other = 'd1111111-1111-4111-8111-111111111111';
    const account = (id: string, channel: string, isPrimary: boolean) => ({
      id, channel, name: id, externalAccountId: null, vendorId: null, sellerId: null, isPrimary,
    });
    api.get.mockResolvedValueOnce([account(other, 'coupang', false), account(ACCOUNT_ID, 'coupang', true)]);
    await expect(resolveCoupangReviewAccountId()).resolves.toBe(ACCOUNT_ID);
    expect(api.get).toHaveBeenCalledWith('/api/channels/accounts');
    api.get.mockResolvedValueOnce([account(other, 'rocket', true)]);
    await expect(resolveCoupangReviewAccountId()).rejects.toThrow('쿠팡 계정');
  });

  it('시작은 확장 operation.start {kind, scope:{channelAccountId, months}, idempotencyKey}로 보낸다', async () => {
    bridge.sendToExtension.mockResolvedValue({ success: true, operationId: OPERATION_ID, reused: false });
    await expect(startCoupangReviewCollection('ext', { channelAccountId: ACCOUNT_ID, months: 3 }, 'key-1')).resolves.toBe(OPERATION_ID);
    expect(bridge.sendToExtension).toHaveBeenCalledWith('ext', {
      action: 'operation.start',
      kind: 'orders.coupang_reviews',
      scope: { channelAccountId: ACCOUNT_ID, months: 3 },
      idempotencyKey: 'key-1',
    });
  });

  it('같은 계정 실행이 이미 돌고 있으면 그 실행을 이어서 본다, 다른 거절은 확장이 준 문장으로 던진다', async () => {
    bridge.sendToExtension.mockResolvedValueOnce({
      success: false, errorCode: 'OPERATION_IN_PROGRESS', error: '같은 실행이 이미 진행 중입니다.',
      details: { existing: { operationId: OPERATION_ID, kind: 'orders.coupang_reviews' } },
    });
    await expect(startCoupangReviewCollection('ext', { channelAccountId: ACCOUNT_ID, months: 3 }, 'key-2')).resolves.toBe(OPERATION_ID);
    bridge.sendToExtension.mockResolvedValueOnce({ success: false, errorCode: 'VALIDATION_FAILED', error: '입력값이 올바르지 않습니다.' });
    await expect(startCoupangReviewCollection('ext', { channelAccountId: ACCOUNT_ID, months: 3 }, 'key-3')).rejects.toThrow('입력값이 올바르지 않습니다.');
  });

  it('상태는 GET /api/operations?kinds=orders.coupang_reviews&limit=3의 최신 실행을 progress.windows로 읽는다', async () => {
    api.get.mockResolvedValueOnce({ operations: [operation()] });
    await expect(readLatestCoupangReviewCollection()).resolves.toEqual({
      status: 'running', operationId: OPERATION_ID, total: 3, completed: 1, current: '2026-08', collected: 150,
      inserted: null, updated: null, error: null,
    });
    expect(api.get).toHaveBeenCalledWith('/api/operations?kinds=orders.coupang_reviews&limit=3');

    api.get.mockResolvedValueOnce({
      operations: [operation({
        status: 'succeeded', finishedAt: '2026-09-25T10:10:00.000Z',
        progress: { current: null, windows: WINDOWS.map((window) => ({ index: window.index, pages: 1, items: 10, done: true })) },
        result: { windows: 3, reviews: 30, inserted: 20, updated: 10 },
      })],
    });
    await expect(readLatestCoupangReviewCollection()).resolves.toMatchObject({
      status: 'done', completed: 3, collected: 30, inserted: 20, updated: 10,
    });

    api.get.mockResolvedValueOnce({ operations: [operation({ status: 'failed', errorCode: 'SITE_LOGIN_REQUIRED', errorMessage: 'Wing 로그인이 필요합니다.' })] });
    await expect(readLatestCoupangReviewCollection()).resolves.toMatchObject({ status: 'error', error: 'Wing 로그인이 필요합니다.' });

    api.get.mockResolvedValueOnce({ operations: [] });
    await expect(readLatestCoupangReviewCollection()).resolves.toEqual({ status: 'idle' });
  });

  it('중단은 서버 POST /api/operations/:id/cancel', async () => {
    api.post.mockResolvedValue({ operation: operation({ status: 'cancelled' }) });
    await cancelCoupangReviewCollection(OPERATION_ID);
    expect(api.post).toHaveBeenCalledWith(`/api/operations/${OPERATION_ID}/cancel`);
  });
});
