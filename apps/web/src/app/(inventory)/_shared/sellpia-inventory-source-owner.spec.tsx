import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginSellpiaInventorySourceAttempt,
  dispatchSellpiaInventoryCollection,
} from './sellpia-inventory-source-owner';

const api = vi.hoisted(() => ({
  post: vi.fn(),
}));
const extension = vi.hoisted(() => ({
  detect: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({ apiClient: api }));
vi.mock('@/lib/extension-bridge', () => ({
  detectOrderCollectionExtensionRuntime: extension.detect,
  sendToExtension: extension.send,
}));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const ATTEMPT_TOKEN = '22222222-2222-4222-8222-222222222222';
const NEW_KEY = '55555555-5555-4555-8555-555555555555';
const FILE_HASH = 'a'.repeat(64);

function attempt(
  state: 'RUNNING' | 'COMPLETE' | 'FAILED' = 'RUNNING',
  patch: Record<string, unknown> = {},
) {
  return {
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    generation: '7',
    state,
    plan: {
      sourceType: 'sellpia_inventory',
      parserVersion: 'sellpia-inventory-v1',
      scope: 'inventory',
      trigger: 'manual_request',
      sourceOrigin: 'https://kiditem.sellpia.com',
      sourceAccountKey: 'kiditem',
      generation: '7',
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
    actualCutoffAt: null,
    fileName: null,
    fileHash: null,
    contentChecksum: null,
    rowCount: 0,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  extension.send.mockResolvedValue({ success: true });
});

describe('Sellpia inventory source-owner transport', () => {
  it('posts the inventory scope and dispatches the exact attemptId action', async () => {
    const started = attempt('RUNNING', { fileHash: FILE_HASH });
    api.post.mockResolvedValue(started);

    await expect(beginSellpiaInventorySourceAttempt(NEW_KEY, 'manual_request'))
      .resolves.toEqual(started);
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-source/attempts',
      { scope: 'inventory', trigger: 'manual_request' },
      { headers: { 'Idempotency-Key': NEW_KEY } },
    );

    dispatchSellpiaInventoryCollection('sellpia-extension', ATTEMPT_ID);
    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
  });

  it('accepts the purchase-preflight trigger on the source-owner path', async () => {
    const started = attempt();
    api.post.mockResolvedValue(started);

    await expect(beginSellpiaInventorySourceAttempt(NEW_KEY, 'purchase_preflight'))
      .resolves.toEqual(started);
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-source/attempts',
      { scope: 'inventory', trigger: 'purchase_preflight' },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
  });

  it('does not wait on the extension answer, which arrives only when the collection ends', async () => {
    extension.send.mockRejectedValue(new Error('extension response lost'));

    expect(() => dispatchSellpiaInventoryCollection('sellpia-extension', ATTEMPT_ID)).not.toThrow();
    await Promise.resolve();
    expect(extension.send).toHaveBeenCalledTimes(1);
  });
});
