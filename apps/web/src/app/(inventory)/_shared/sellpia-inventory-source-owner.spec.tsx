import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionSessionReply } from '@/test/fixtures/extension-collection-session';
import {
  beginSellpiaInventorySourceAttempt,
  sellpiaInventoryCollection,
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
vi.mock('@/lib/extension-auth', () => ({ transferExtensionAuthTo: vi.fn() }));

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
  extension.detect.mockResolvedValue({ status: 'ready', extensionId: 'sellpia-extension', version: '1' });
  // The run answers only when the collection ends; its session shows it took the attempt.
  extension.send.mockImplementation(async (_extensionId: string, message: unknown) =>
    extensionSessionReply(message, 'inventory.sellpia') ?? new Promise(() => undefined));
});

const CANCEL_PATH = `/api/inventory/sellpia-source/attempts/${ATTEMPT_ID}/cancel`;

function startCollection() {
  return sellpiaInventoryCollection({ organizationId: 'org-1' }).start(undefined, { status: undefined });
}

describe('Sellpia inventory source-owner transport', () => {
  it('posts the inventory scope under the idempotency key', async () => {
    const started = attempt('RUNNING', { fileHash: FILE_HASH });
    api.post.mockResolvedValue(started);

    await expect(beginSellpiaInventorySourceAttempt(NEW_KEY, 'manual_request'))
      .resolves.toEqual(started);
    expect(api.post).toHaveBeenCalledWith(
      '/api/inventory/sellpia-source/attempts',
      { scope: 'inventory', trigger: 'manual_request' },
      { headers: { 'Idempotency-Key': NEW_KEY } },
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

  it('hands the opened attempt to the extension and starts once the extension holds its session', async () => {
    api.post.mockResolvedValue(attempt('RUNNING'));

    await expect(startCollection()).resolves.toEqual({ outcome: 'started', attemptId: ATTEMPT_ID });

    expect(extension.send).toHaveBeenCalledWith(
      'sellpia-extension',
      { action: 'collectSellpiaInventory', attemptId: ATTEMPT_ID },
      190_000,
    );
    expect(api.post).not.toHaveBeenCalledWith(CANCEL_PATH);
  });

  it('stops the opened attempt through the owner when the extension does not take it', async () => {
    api.post.mockImplementation(async (path: string) =>
      path === CANCEL_PATH ? attempt('FAILED') : attempt('RUNNING'));
    extension.send.mockImplementation(async (_extensionId: string, message: { action: string }) =>
      message.action === 'collectSellpiaInventory'
        ? { success: false, error: 'Another Sellpia inventory collection is running' }
        : null);

    await expect(startCollection()).rejects.toThrow(
      '확장 프로그램이 수집을 넘겨받지 못했습니다. 확장 상태를 확인한 뒤 다시 시작해 주세요.',
    );
    expect(api.post).toHaveBeenCalledWith(CANCEL_PATH);
  });
});
