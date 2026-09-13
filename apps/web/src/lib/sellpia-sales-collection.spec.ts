import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectSellpiaSaleSummaryFromExtension } from './sellpia-sales-collection';

const mocks = vi.hoisted(() => ({
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
  transferExtensionAuthTo: vi.fn(),
  createSecureRandomUuid: vi.fn(),
  beginSellpiaSalesSourceAttempt: vi.fn(),
  readSellpiaSalesSourceAttempt: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionId: mocks.detectOrderCollectionExtensionId,
  sendToExtension: mocks.sendToExtension,
}));
vi.mock('@/lib/extension-auth', () => ({
  transferExtensionAuthTo: mocks.transferExtensionAuthTo,
}));
vi.mock('@/lib/secure-random-uuid', () => ({
  createSecureRandomUuid: mocks.createSecureRandomUuid,
}));
vi.mock('@/lib/sellpia-sales-api', () => ({
  beginSellpiaSalesSourceAttempt: mocks.beginSellpiaSalesSourceAttempt,
  readSellpiaSalesSourceAttempt: mocks.readSellpiaSalesSourceAttempt,
}));

const attemptId = '11111111-1111-4111-8111-111111111111';
const plan = {
  sourceType: 'sellpia_sales_daily' as const,
  parserVersion: 'sellpia-sales-v1' as const,
  sourceOrigin: 'https://kiditem.sellpia.com' as const,
  sourcePath: '/sale_summary.html?mode=main_link' as const,
  sourceAccountKey: 'kiditem' as const,
  range: { from: '2026-07-17', to: '2026-07-18' },
  businessDates: ['2026-07-17', '2026-07-18'],
};

function attempt(state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING') {
  return {
    attemptId,
    sourceType: 'sellpia_sales_daily' as const,
    state,
    expiresAt: '2099-01-01T00:00:00.000Z',
    plan,
    actualCutoffAt: state === 'COMPLETE' ? '2026-07-18T00:00:00.000Z' : null,
    completedAt: state === 'COMPLETE' ? '2026-07-18T10:00:00.000Z' : null,
    contentChecksum: state === 'COMPLETE' ? 'a'.repeat(64) : null,
    contentByteCount: state === 'COMPLETE' ? 100 : null,
    rowCount: state === 'COMPLETE' ? 2 : 0,
    sellerCount: state === 'COMPLETE' ? 1 : 0,
    businessDates: plan.businessDates,
    errorCode: state === 'FAILED' ? 'SELLPIA_LOGIN_REQUIRED' : null,
    errorMessage: state === 'FAILED' ? '로그인이 필요합니다.' : null,
  };
}

describe('Sellpia sales source-owner bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSecureRandomUuid.mockReturnValue('99999999-9999-4999-8999-999999999999');
    mocks.detectOrderCollectionExtensionId.mockResolvedValue('order-collector');
    mocks.transferExtensionAuthTo.mockResolvedValue(undefined);
    mocks.beginSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt('COMPLETE'));
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      attemptId,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    });
  });

  it('freezes the server attempt before dispatching the attempt ID only', async () => {
    await collectSellpiaSaleSummaryFromExtension({ startDate: plan.range.from, endDate: plan.range.to });

    expect(mocks.beginSellpiaSalesSourceAttempt).toHaveBeenCalledWith({
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
      from: plan.range.from,
      to: plan.range.to,
    });
    expect(mocks.transferExtensionAuthTo).toHaveBeenCalledWith('order-collector');
    expect(mocks.sendToExtension).toHaveBeenCalledWith(
      'order-collector',
      { action: 'collectSellpiaSaleSummary', attemptId },
      190_000,
    );
    expect(mocks.detectOrderCollectionExtensionId).toHaveBeenCalledWith(
      1200,
      'collectSellpiaSaleSummaryAuthoritativeV1',
    );
  });

  it('reconciles a lost extension response from persisted COMPLETE state', async () => {
    mocks.sendToExtension.mockRejectedValueOnce(new Error('extension response lost'));

    await expect(collectSellpiaSaleSummaryFromExtension()).resolves.toMatchObject({
      success: true,
      attemptId,
      terminalState: 'COMPLETE',
    });
    expect(mocks.readSellpiaSalesSourceAttempt).toHaveBeenCalledWith(attemptId);
  });

  it('does not claim success while the owner remains RUNNING', async () => {
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: true,
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      '아직 완료되지 않았습니다',
    );
  });

  it('rejects a production response that omits continuationRequired', async () => {
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      'continuationRequired',
    );
  });

  it('rejects a production response with a non-boolean continuationRequired', async () => {
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: 'true',
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      'continuationRequired',
    );
  });

  it('rejects an extension response with an unknown key', async () => {
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: true,
      unexpected: 'ignored',
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      'unrecognized_keys',
    );
  });

  it('does not certify a running owner from a response for another attempt', async () => {
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      attemptId: '22222222-2222-4222-8222-222222222222',
      terminalState: 'COMPLETE',
      continuationRequired: false,
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      '응답이 일치하지 않습니다',
    );
  });

  it('returns an already-terminal owner result without provider dispatch', async () => {
    mocks.beginSellpiaSalesSourceAttempt.mockResolvedValue(attempt('FAILED'));

    await expect(collectSellpiaSaleSummaryFromExtension()).resolves.toMatchObject({
      success: false,
      terminalState: 'FAILED',
      errorCode: 'SELLPIA_LOGIN_REQUIRED',
    });
    expect(mocks.detectOrderCollectionExtensionId).not.toHaveBeenCalled();
    expect(mocks.sendToExtension).not.toHaveBeenCalled();
  });

  it('accepts the production-shaped COMPLETE outcome and keeps the owner result authoritative', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: true,
      attemptId,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).resolves.toMatchObject({
      success: true,
      terminalState: 'COMPLETE',
    });
  });

  it('accepts the production-shaped FAILED outcome from the terminal owner', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'FAILED',
      continuationRequired: false,
      errorCode: 'SELLPIA_LOGIN_REQUIRED',
      error: '로그인이 필요합니다.',
    });
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt('FAILED'));

    await expect(collectSellpiaSaleSummaryFromExtension()).resolves.toMatchObject({
      success: false,
      terminalState: 'FAILED',
      errorCode: 'SELLPIA_LOGIN_REQUIRED',
    });
  });

  it('surfaces a bounded extension failure while the exact owner remains RUNNING', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: false,
      errorCode: 'SOURCE_OWNER_UNAVAILABLE',
      error: 'Sellpia sales source owner is unavailable.',
    });
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());

    await expect(collectSellpiaSaleSummaryFromExtension()).rejects.toThrow(
      'SOURCE_OWNER_UNAVAILABLE: Sellpia sales source owner is unavailable.',
    );
  });

  it('truncates a returned extension failure message to the boundary', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: false,
      errorCode: 'SOURCE_OWNER_UNAVAILABLE',
      error: 'x'.repeat(400),
    });
    mocks.readSellpiaSalesSourceAttempt.mockResolvedValue(attempt());

    let thrown: unknown;
    try {
      await collectSellpiaSaleSummaryFromExtension();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toHaveLength(300);
  });

  it('prefers a terminal owner result over an extension failure response', async () => {
    mocks.sendToExtension.mockResolvedValue({
      success: false,
      attemptId,
      terminalState: 'RUNNING',
      continuationRequired: false,
      errorCode: 'SOURCE_OWNER_UNAVAILABLE',
      error: 'Sellpia sales source owner is unavailable.',
    });

    await expect(collectSellpiaSaleSummaryFromExtension()).resolves.toMatchObject({
      success: true,
      terminalState: 'COMPLETE',
    });
  });
});
