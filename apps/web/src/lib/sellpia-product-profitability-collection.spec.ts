import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectSellpiaProductProfitFromExtension,
  SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION,
  SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY,
} from './sellpia-product-profitability-collection';

const mocks = vi.hoisted(() => ({
  begin: vi.fn(),
  read: vi.fn(),
  detect: vi.fn(),
  transfer: vi.fn(),
  send: vi.fn(),
  uuid: vi.fn(() => '33333333-3333-4333-8333-333333333333'),
}));

vi.mock('./sellpia-product-sales-api', () => ({
  beginSellpiaProductProfitabilitySourceAttempt: mocks.begin,
  readSellpiaProductProfitabilitySourceAttempt: mocks.read,
}));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: mocks.detect,
  sendToExtension: mocks.send,
}));
vi.mock('@/lib/extension-auth', () => ({
  transferExtensionAuthTo: mocks.transfer,
}));
vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: mocks.uuid,
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const PLAN = {
  from: '2025-08-02',
  to: '2026-09-06',
  coveredMonths: ['2025-08', '2025-09', '2026-09'],
};
const SCOPE = { organizationId: 'org-1', environmentKey: 'http://localhost:3000' };

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: '22222222-2222-4222-8222-222222222222',
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    capturedAt: '2026-09-07T00:00:00.000Z',
    generation: state === 'COMPLETE' ? '8' : null,
    errorCode: state === 'FAILED' ? 'sellpia_login_required' : null,
    errorMessage: state === 'FAILED' ? '로그인이 필요합니다.' : null,
    plan: PLAN,
  };
}

function summary(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  const value = attempt(state);
  const { attemptToken: _attemptToken, ...withoutToken } = value;
  return withoutToken;
}

describe('collectSellpiaProductProfitFromExtension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detect.mockResolvedValue({ status: 'ready', extensionId: 'extension-id' });
    mocks.transfer.mockResolvedValue(undefined);
    mocks.send.mockResolvedValue({
      success: true,
      attemptId: ATTEMPT_ID,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    });
    mocks.begin.mockResolvedValue(attempt());
    mocks.read.mockResolvedValue(summary('COMPLETE'));
  });

  it('admits one frozen server attempt and dispatches only its id', async () => {
    const order: string[] = [];
    mocks.detect.mockImplementation(async () => {
      order.push('detect');
      return { status: 'ready', extensionId: 'extension-id' };
    });
    mocks.begin.mockImplementation(async () => {
      order.push('begin');
      return attempt();
    });
    const result = await collectSellpiaProductProfitFromExtension(SCOPE);

    expect(order.slice(0, 2)).toEqual(['detect', 'begin']);
    expect(mocks.begin).toHaveBeenCalledWith({
      idempotencyKey: '33333333-3333-4333-8333-333333333333',
    });
    expect(mocks.detect).toHaveBeenCalledWith(1_200, [
      SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_CAPABILITY,
    ]);
    expect(mocks.send).toHaveBeenCalledWith(
      'extension-id',
      { action: SELLPIA_PRODUCT_PROFITABILITY_EXTENSION_ACTION, attemptId: ATTEMPT_ID },
      190_000,
    );
    expect(result).toMatchObject({ attemptId: ATTEMPT_ID, state: 'COMPLETE', success: true });
  });

  it('reconciles a terminal owner result when the dispatch response is lost', async () => {
    mocks.send.mockRejectedValue(new Error('extension response lost'));

    const result = await collectSellpiaProductProfitFromExtension(SCOPE);

    expect(mocks.read).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(result).toMatchObject({ state: 'COMPLETE', success: true });
  });

  it('keeps the exact owner attempt retryable when both terminal status reads are lost', async () => {
    mocks.read
      .mockRejectedValueOnce(new Error('status response lost'))
      .mockRejectedValueOnce(new Error('status retry lost'))
      .mockResolvedValue(summary('COMPLETE'));

    await expect(collectSellpiaProductProfitFromExtension(SCOPE))
      .rejects.toThrow('status response lost');

    const result = await collectSellpiaProductProfitFromExtension(SCOPE);

    expect(result).toMatchObject({ attemptId: ATTEMPT_ID, state: 'COMPLETE', success: true });
    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledTimes(4);
    expect(mocks.read).toHaveBeenCalledWith(ATTEMPT_ID);
  });

  it('does not claim success while the exact owner attempt is still running', async () => {
    mocks.send.mockResolvedValue({
      success: false,
      attemptId: ATTEMPT_ID,
      terminalState: 'RUNNING',
      continuationRequired: true,
    });
    mocks.read.mockResolvedValue(summary('RUNNING'));

    await expect(collectSellpiaProductProfitFromExtension(SCOPE))
      .rejects.toThrow('아직 완료되지 않았습니다');
  });

  it('does not dispatch an already-terminal idempotent begin result', async () => {
    mocks.begin.mockResolvedValue(attempt('FAILED'));
    mocks.read.mockResolvedValue(summary('FAILED'));

    const result = await collectSellpiaProductProfitFromExtension(SCOPE);

    expect(mocks.detect).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ state: 'FAILED', success: false });
  });

  it('does not admit a server attempt when the owner extension is unavailable', async () => {
    mocks.detect.mockRejectedValue(new Error('extension missing'));

    await expect(collectSellpiaProductProfitFromExtension(SCOPE))
      .rejects.toThrow('extension missing');
    expect(mocks.begin).not.toHaveBeenCalled();
  });
});
