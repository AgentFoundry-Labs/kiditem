import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  cancelCoupangReviewCollection,
  getCoupangReviewCollectionExtensionStatus,
  getCoupangReviewCollectionStatus,
  recoverCoupangReviewCollection,
  runCoupangReviewCollection,
} from './review-extension';

const ATTEMPT_ID = 'a1111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = 'b1111111-1111-4111-8111-111111111111';
const PLAN = {
  sourceType: 'coupang_reviews',
  parserVersion: 'coupang-review-v1',
  months: 3,
  windows: [
    { index: 0, label: '2026-09', start: '2026-09-01', end: '2026-09-07' },
    { index: 1, label: '2026-08', start: '2026-08-01', end: '2026-08-31' },
    { index: 2, label: '2026-07', start: '2026-07-01', end: '2026-07-31' },
  ],
  pageSize: 50,
  maxPagesPerWindow: 40,
};

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    sourceImportRunId: ATTEMPT_ID,
    state: 'RUNNING',
    plan: PLAN,
    expiresAt: '2026-09-07T12:00:00.000Z',
    completedWindows: [],
    collected: 0,
    created: 0,
    updated: 0,
    linked: 0,
    unlinked: 0,
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

describe('Coupang review source-owner web bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('begins the server attempt before dispatching its frozen control to the extension', async () => {
    api.post.mockResolvedValue(attempt({ attemptToken: ATTEMPT_TOKEN }));
    bridge.sendToExtension.mockResolvedValue({ success: true, started: true });

    await expect(runCoupangReviewCollection('review-extension', 3, 'stable-review-key'))
      .resolves.toMatchObject({ status: 'running', runId: ATTEMPT_ID, months: 3 });

    expect(api.post).toHaveBeenCalledWith(
      '/api/reviews/attempts',
      { months: 3 },
      { headers: { 'Idempotency-Key': 'stable-review-key' } },
    );
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'runCoupangReviewCollection',
      attemptId: ATTEMPT_ID,
      attemptToken: ATTEMPT_TOKEN,
      plan: PLAN,
    });
  });

  it('reads status from the Orders owner and fences cancellation with its token', async () => {
    api.get.mockResolvedValue(attempt({ state: 'COMPLETE', collected: 4 }));
    await expect(getCoupangReviewCollectionStatus('review-extension', ATTEMPT_ID))
      .resolves.toMatchObject({ status: 'done', runId: ATTEMPT_ID, collected: 4 });
    expect(api.get).toHaveBeenCalledWith(`/api/reviews/attempts/${ATTEMPT_ID}`);
    expect(bridge.sendToExtension).not.toHaveBeenCalled();

    api.post.mockResolvedValue({});
    bridge.sendToExtension.mockResolvedValue({ success: true });
    await cancelCoupangReviewCollection('review-extension', ATTEMPT_ID, ATTEMPT_TOKEN);
    expect(api.post).toHaveBeenCalledWith(
      `/api/reviews/attempts/${ATTEMPT_ID}/cancel`,
      undefined,
      { headers: { 'x-source-attempt-token': ATTEMPT_TOKEN } },
    );
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'cancelCoupangReviewCollection',
      runId: ATTEMPT_ID,
    });
  });

  it('recovers the token-free extension checkpoint and reads owner progress without redispatching', async () => {
    bridge.sendToExtension.mockResolvedValue({
      status: 'running',
      runId: ATTEMPT_ID,
      cancelRequested: true,
    });
    api.get.mockResolvedValue(attempt({ collected: 2 }));

    await expect(recoverCoupangReviewCollection('review-extension'))
      .resolves.toMatchObject({ status: 'running', runId: ATTEMPT_ID, collected: 2, cancelRequested: true });
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'getCoupangReviewCollectionStatus',
    });
    expect(api.get).toHaveBeenCalledWith(`/api/reviews/attempts/${ATTEMPT_ID}`);
  });

  it('resolves a lost in-memory token through owner control for cancel', async () => {
    api.get.mockResolvedValueOnce(attempt({ attemptToken: ATTEMPT_TOKEN }));
    api.post.mockResolvedValue({});
    bridge.sendToExtension.mockResolvedValue({ success: true, pending: false });

    await cancelCoupangReviewCollection('review-extension', ATTEMPT_ID);

    expect(api.get).toHaveBeenCalledWith(`/api/reviews/attempts/${ATTEMPT_ID}/control`);
    expect(api.post).toHaveBeenCalledWith(
      `/api/reviews/attempts/${ATTEMPT_ID}/cancel`,
      undefined,
      { headers: { 'x-source-attempt-token': ATTEMPT_TOKEN } },
    );
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'cancelCoupangReviewCollection',
      runId: ATTEMPT_ID,
    });
  });

  it('still sends the local cancel fence when auth/control recovery is unavailable', async () => {
    api.get.mockRejectedValue(new Error('auth unavailable'));
    bridge.sendToExtension.mockResolvedValue({ success: true, pending: true });

    await expect(cancelCoupangReviewCollection('review-extension', ATTEMPT_ID))
      .rejects.toThrow('auth unavailable');
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'cancelCoupangReviewCollection',
      runId: ATTEMPT_ID,
    });
  });

  it('dispatches the local fence before owner cancellation HTTP', async () => {
    const events: string[] = [];
    bridge.sendToExtension.mockImplementation(async () => {
      events.push('extension');
      return { success: true };
    });
    api.post.mockImplementation(async () => {
      events.push('owner');
      return {};
    });

    await cancelCoupangReviewCollection('review-extension', ATTEMPT_ID, ATTEMPT_TOKEN);

    expect(events).toEqual(['extension', 'owner']);
  });

  it('rejects a recovered owner control for a different attempt', async () => {
    api.get.mockResolvedValue(attempt({ attemptId: 'a2222222-2222-4222-8222-222222222222', attemptToken: ATTEMPT_TOKEN }));
    bridge.sendToExtension.mockResolvedValue({ success: true });

    await expect(cancelCoupangReviewCollection('review-extension', ATTEMPT_ID))
      .rejects.toThrow('현재 실행과 일치하지 않습니다');
    expect(api.post).not.toHaveBeenCalled();
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'cancelCoupangReviewCollection',
      runId: ATTEMPT_ID,
    });
  });

  it('exposes extension status without retaining an attempt token', async () => {
    bridge.sendToExtension.mockResolvedValue({ status: 'running', runId: ATTEMPT_ID });
    await expect(getCoupangReviewCollectionExtensionStatus('review-extension'))
      .resolves.toEqual({ status: 'running', runId: ATTEMPT_ID });
    expect(bridge.sendToExtension).toHaveBeenCalledWith('review-extension', {
      action: 'getCoupangReviewCollectionStatus',
    });
  });

  it('does not redispatch a terminal idempotency replay to the extension', async () => {
    api.post.mockResolvedValue(attempt({
      state: 'COMPLETE',
      collected: 2,
      attemptToken: ATTEMPT_TOKEN,
    }));

    await expect(runCoupangReviewCollection('review-extension', 3, 'replayed-key'))
      .resolves.toMatchObject({ status: 'done', started: false, collected: 2 });
    expect(bridge.sendToExtension).not.toHaveBeenCalled();
  });
});
