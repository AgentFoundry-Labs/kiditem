import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectSellpiaManualMatchSnapshot,
  finalizeSellpiaManualMatchCollection,
} from './sellpia-manual-match-collection';

const bridge = vi.hoisted(() => ({
  collectSellpiaManualMatch: vi.fn(),
  detectOrderCollectionExtensionRuntime: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('@/lib/extension-bridge', () => bridge);

const snapshot = {
  source: 'sellpia_product_manual_match' as const,
  version: 1 as const,
  targetCount: 1,
  targetCodes: ['634-1'],
  rowCount: 1,
  rows: [{
    productCode: '634-1',
    aliasTitle: '샤이니무지개칼라링(12개입)',
    itemCount: 12,
    matchedType: 'M' as const,
    evidenceCount: 1,
  }],
};

describe('Sellpia manual-match collection adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionRuntime.mockResolvedValue({
      status: 'ready',
      extensionId: 'order-extension',
      version: '0.1.95',
    });
    bridge.collectSellpiaManualMatch.mockResolvedValue({
      success: true,
      runId: '11111111-1111-4111-8111-111111111111',
      sourceOrigin: 'https://kiditem.sellpia.com',
      snapshot,
    });
  });

  it('requires the versioned read-only capability and returns the validated snapshot', async () => {
    await expect(collectSellpiaManualMatchSnapshot(
      '11111111-1111-4111-8111-111111111111',
      ['634-1'],
    )).resolves.toEqual({
      extensionId: 'order-extension',
      runId: '11111111-1111-4111-8111-111111111111',
      snapshot,
    });
    expect(bridge.detectOrderCollectionExtensionRuntime).toHaveBeenCalledWith(1_200, [
      'browserCollectionSessions',
      'orderCollectionFailureEvidenceV1',
      'collectSellpiaManualMatchV1',
      'collectSellpiaManualMatchPortV1',
    ]);
    expect(bridge.collectSellpiaManualMatch).toHaveBeenCalledWith(
      'order-extension',
      '11111111-1111-4111-8111-111111111111',
      ['634-1'],
    );
  });

  it('maps a Sellpia login failure to an operator-facing recovery message', async () => {
    bridge.collectSellpiaManualMatch.mockResolvedValue({
      success: false,
      runId: '11111111-1111-4111-8111-111111111111',
      errorCode: 'sellpia_manual_match_login_required',
      error: 'Sellpia login is required.',
    });

    await expect(collectSellpiaManualMatchSnapshot(
      '11111111-1111-4111-8111-111111111111',
      ['634-1'],
    )).rejects.toMatchObject({
      failureCode: 'sellpia_manual_match_login_required',
      message: expect.stringContaining('Sellpia 로그인이 필요합니다'),
    });
  });

  it('finalizes the deferred extension lifecycle after backend import', async () => {
    await finalizeSellpiaManualMatchCollection({
      extensionId: 'order-extension',
      runId: '11111111-1111-4111-8111-111111111111',
    }, 'succeeded', 'imported');

    expect(bridge.sendToExtension).toHaveBeenCalledWith('order-extension', {
      action: 'finalizeCollectionSession',
      runId: '11111111-1111-4111-8111-111111111111',
      status: 'succeeded',
      message: 'imported',
    });
  });
});
