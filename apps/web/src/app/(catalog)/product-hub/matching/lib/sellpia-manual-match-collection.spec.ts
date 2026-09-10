import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectSellpiaManualMatchSnapshot,
  sellpiaManualMatchCorrelationStorageKey,
} from './sellpia-manual-match-collection';

const bridge = vi.hoisted(() => ({
  collectSellpiaManualMatch: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
}));
const api = vi.hoisted(() => ({
  beginSellpiaManualMatchSourceAttempt: vi.fn(),
  readSellpiaManualMatchSourceAttempt: vi.fn(),
  readSellpiaManualMatchSourceCurrent: vi.fn(),
}));
const auth = vi.hoisted(() => ({ transferExtensionAuthTo: vi.fn() }));

vi.mock('@/lib/extension-bridge', () => bridge);
vi.mock('@/lib/extension-auth', () => auth);
vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: vi.fn(() => '33333333-3333-4333-8333-333333333333'),
}));
vi.mock('./channel-sku-matching-api', () => api);

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const snapshotStatus = {
  targetCount: 1,
  matchedTargetCount: 1,
  aliasCount: 1,
  snapshotHash: 'a'.repeat(64),
  capturedAt: '2026-08-03T00:00:00.000Z',
};
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const SCOPE = { organizationId: 'org-1' };
const plan = {
  sourceType: 'sellpia_product_manual_match' as const,
  parserVersion: 'sellpia-manual-match-v1' as const,
  sourceOrigin: 'https://kiditem.sellpia.com' as const,
  sourcePath: '/product_manual_match.html' as const,
  targetCodes: ['634-1'],
  targetCount: 1,
};

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING', patch = {}) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan,
    errorCode: null,
    errorMessage: null,
    contentChecksum: null,
    capturedAt: null,
    ...patch,
  };
}

describe('Sellpia manual-match source owner bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'ready',
      extensionId: 'order-extension',
      version: '0.1.95',
    });
    bridge.collectSellpiaManualMatch.mockResolvedValue({
      success: true,
      attemptId: ATTEMPT_ID,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    });
    api.beginSellpiaManualMatchSourceAttempt.mockResolvedValue(attempt());
    api.readSellpiaManualMatchSourceAttempt.mockResolvedValue(attempt('COMPLETE'));
    api.readSellpiaManualMatchSourceCurrent.mockResolvedValue({
      latestAttempt: attempt('COMPLETE'),
      currentSnapshot: snapshotStatus,
    });
    auth.transferExtensionAuthTo.mockResolvedValue(undefined);
  });

  it('begins a server-owned attempt and sends only its ID to the extension', async () => {
    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { attemptId: ATTEMPT_ID, state: 'COMPLETE' },
      status: { aliasCount: 1 },
    });
    expect(api.beginSellpiaManualMatchSourceAttempt).toHaveBeenCalledWith({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1_200, [
      'browserCollectionSessions',
      'orderCollectionFailureEvidenceV1',
      'sellpiaManualMatchSourceOwnerV1',
    ]);
    expect(auth.transferExtensionAuthTo).toHaveBeenCalledWith('order-extension');
    expect(bridge.collectSellpiaManualMatch).toHaveBeenCalledWith(
      'order-extension',
      ATTEMPT_ID,
    );
  });

  it('reconciles COMPLETE when the page loses the extension response', async () => {
    bridge.collectSellpiaManualMatch.mockRejectedValue(new Error('page closed'));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { state: 'COMPLETE' },
      status: { snapshotHash: 'a'.repeat(64) },
    });
    expect(bridge.collectSellpiaManualMatch).toHaveBeenCalledOnce();
    expect(api.readSellpiaManualMatchSourceAttempt).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it('reuses a persisted RUNNING attempt on an explicit retry', async () => {
    window.sessionStorage.setItem(sellpiaManualMatchCorrelationStorageKey(SCOPE.organizationId), JSON.stringify({
      idempotencyKey: 'retry-key',
      attemptId: ATTEMPT_ID,
    }));
    api.readSellpiaManualMatchSourceAttempt
      .mockResolvedValueOnce(attempt('RUNNING'))
      .mockResolvedValueOnce(attempt('COMPLETE'));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { state: 'COMPLETE' },
    });
    expect(api.beginSellpiaManualMatchSourceAttempt).not.toHaveBeenCalled();
    expect(bridge.collectSellpiaManualMatch).toHaveBeenCalledWith('order-extension', ATTEMPT_ID);
  });

  it('reuses the same idempotency key when the begin response is lost', async () => {
    api.beginSellpiaManualMatchSourceAttempt
      .mockRejectedValueOnce(new Error('begin response lost'))
      .mockResolvedValueOnce(attempt());

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).rejects.toThrow('begin response lost');
    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { state: 'COMPLETE' },
    });
    expect(api.beginSellpiaManualMatchSourceAttempt).toHaveBeenNthCalledWith(1, {
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    expect(api.beginSellpiaManualMatchSourceAttempt).toHaveBeenNthCalledWith(2, {
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
  });

  it('surfaces the persisted owner failure without importing a page snapshot', async () => {
    api.readSellpiaManualMatchSourceAttempt.mockResolvedValue(attempt('FAILED', {
      errorCode: 'sellpia_manual_match_login_required',
      errorMessage: 'Sellpia login is required.',
    }));
    bridge.collectSellpiaManualMatch.mockResolvedValue({
      success: false,
      attemptId: ATTEMPT_ID,
      terminalState: 'FAILED',
      continuationRequired: false,
      errorCode: 'sellpia_manual_match_login_required',
      error: 'Sellpia login is required.',
    });

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).rejects.toMatchObject({
      failureCode: 'sellpia_manual_match_login_required',
    });
    expect(api.readSellpiaManualMatchSourceCurrent).not.toHaveBeenCalled();
  });

  it('does not dispatch provider work when an idempotent begin already returned COMPLETE', async () => {
    api.beginSellpiaManualMatchSourceAttempt.mockResolvedValue(attempt('COMPLETE'));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { state: 'COMPLETE' },
    });
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledOnce();
    expect(bridge.collectSellpiaManualMatch).not.toHaveBeenCalled();
  });

  it('uses the current publication when a later attempt is already running', async () => {
    api.readSellpiaManualMatchSourceCurrent.mockResolvedValue({
      latestAttempt: attempt('RUNNING', {
        attemptId: '99999999-9999-4999-8999-999999999999',
      }),
      currentSnapshot: snapshotStatus,
    });

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { attemptId: ATTEMPT_ID, state: 'COMPLETE' },
      status: { snapshotHash: 'a'.repeat(64) },
    });
  });

  it('does not reuse a correlation from another organization or origin scope', async () => {
    window.sessionStorage.setItem(sellpiaManualMatchCorrelationStorageKey('org-2'), JSON.stringify({
      idempotencyKey: 'other-org-key',
      attemptId: ATTEMPT_ID,
    }));

    await expect(collectSellpiaManualMatchSnapshot(SCOPE)).resolves.toMatchObject({
      attempt: { attemptId: ATTEMPT_ID },
    });
    expect(api.beginSellpiaManualMatchSourceAttempt).toHaveBeenCalledWith({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
  });
});
