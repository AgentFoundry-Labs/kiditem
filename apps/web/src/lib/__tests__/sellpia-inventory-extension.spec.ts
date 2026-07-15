import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  collectSellpiaInventory: vi.fn(),
  detectOrderCollectionExtensionId: vi.fn(),
  sendToExtension: vi.fn(),
}));

vi.mock('../extension-bridge', () => bridge);

import {
  SellpiaInventoryExtensionError,
  collectSellpiaInventory,
} from '../sellpia-inventory-extension';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('Sellpia inventory extension adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.detectOrderCollectionExtensionId.mockResolvedValue('extension-id');
    bridge.sendToExtension.mockResolvedValue({
      success: true,
      capabilities: { collectSellpiaInventory: true },
    });
  });

  it('distinguishes a missing extension from a responding outdated extension', async () => {
    bridge.detectOrderCollectionExtensionId.mockResolvedValueOnce(null);
    await expect(collectSellpiaInventory({ runId: RUN_ID })).rejects.toMatchObject({
      reason: 'extension_missing',
    } satisfies Partial<SellpiaInventoryExtensionError>);

    bridge.sendToExtension.mockResolvedValueOnce({ success: true, capabilities: {} });
    await expect(collectSellpiaInventory({ runId: RUN_ID })).rejects.toMatchObject({
      reason: 'extension_outdated',
    } satisfies Partial<SellpiaInventoryExtensionError>);
  });

  it('retries one service-worker communication restart with the identical claim-token run ID', async () => {
    bridge.collectSellpiaInventory
      .mockRejectedValueOnce(new Error('The message port closed before a response was received.'))
      .mockResolvedValueOnce({
        success: true,
        runId: RUN_ID,
        workbookBase64: 'd29ya2Jvb2s=',
        fileName: 'inventory.xls',
        mimeType: 'application/vnd.ms-excel',
        size: 8,
        sourceOrigin: 'https://kiditem.sellpia.com',
        sourceAccountKey: 'kiditem',
      });

    const result = await collectSellpiaInventory({ runId: RUN_ID });

    expect(bridge.collectSellpiaInventory).toHaveBeenNthCalledWith(1, 'extension-id', RUN_ID);
    expect(bridge.collectSellpiaInventory).toHaveBeenNthCalledWith(2, 'extension-id', RUN_ID);
    expect(result.file.name).toBe('inventory.xls');
  });

  it('preserves Task 6 collection failure codes', async () => {
    bridge.collectSellpiaInventory.mockResolvedValue({
      success: false,
      runId: RUN_ID,
      errorCode: 'sellpia_login_required',
      error: 'Sellpia login is required.',
    });

    await expect(collectSellpiaInventory({ runId: RUN_ID })).rejects.toMatchObject({
      failureCode: 'sellpia_login_required',
      message: 'Sellpia login is required.',
    });
  });

  it('does not retry a validated business/schema failure as a service-worker restart', async () => {
    bridge.collectSellpiaInventory.mockRejectedValue(new Error('invalid extension reply'));

    await expect(collectSellpiaInventory({ runId: RUN_ID })).rejects.toThrow(
      'invalid extension reply',
    );
    expect(bridge.collectSellpiaInventory).toHaveBeenCalledTimes(1);
  });

  it('validates the Task 6 reply in the bridge before workbook decoding', async () => {
    const actualBridge = await vi.importActual<typeof import('../extension-bridge')>(
      '../extension-bridge',
    );
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          sendMessage: (_id: string, _message: unknown, callback: (value: unknown) => void) => {
            callback({
              success: true,
              runId: RUN_ID,
              workbookBase64: 'not base64!',
              fileName: 'inventory.xls',
              mimeType: 'application/vnd.ms-excel',
              size: 8,
              sourceOrigin: 'https://kiditem.sellpia.com',
              sourceAccountKey: 'kiditem',
            });
          },
        },
      },
    });

    await expect(
      actualBridge.collectSellpiaInventory('extension-id', RUN_ID),
    ).rejects.toThrow();
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: undefined,
    });
  });
});
