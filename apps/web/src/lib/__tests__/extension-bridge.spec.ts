import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KIDITEM_EXTENSION_ID_KEY,
  KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
  KIDITEM_SELLPIA_MANUAL_MATCH_PORT_NAME,
  KIDITEM_SOURCING_EXTENSION_ID_KEY,
  detectExtensionId,
  detectWingFormExtensionId,
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  detectSourcingExtensionId,
  collectSellpiaManualMatch,
  sendToExtensionViaPort,
} from '../extension-bridge';

type PingResponse = {
  success: boolean;
  version?: string;
  capabilities?: Record<string, unknown>;
};

it('removes the orphan page-owned Sellpia raw-snapshot bridge', async () => {
  const bridge = await import('../extension-bridge');
  expect(bridge).not.toHaveProperty('collectSellpiaInventory');
  expect(existsSync(new URL('../sellpia-inventory-extension.ts', import.meta.url))).toBe(false);
});

function installChrome(response: PingResponse) {
  Object.defineProperty(window, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: (
          _id: string,
          _message: unknown,
          callback: (value: PingResponse) => void,
        ) => callback(response),
      },
    },
  });
}

describe('universal extension discovery', () => {
  beforeEach(() => {
    window.localStorage.clear();
    installChrome({ success: true });
  });

  it('rejects a Coupang extension without environment profiles capability', async () => {
    window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, 'coupang-extension');
    await expect(detectExtensionId(5)).resolves.toBeNull();
  });

  it('accepts a Coupang extension with environment profiles capability', async () => {
    installChrome({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true },
    });
    window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, 'coupang-extension');
    await expect(detectExtensionId(5)).resolves.toBe('coupang-extension');
  });

  it('requires the durable Wing form port capability without client raster', async () => {
    window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, 'coupang-extension');
    installChrome({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true },
    });
    await expect(detectWingFormExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        wingFormPortV1: true,
      },
    });
    await expect(detectWingFormExtensionId(5)).resolves.toBe(
      'coupang-extension',
    );
  });

  it('requires both sourcing and environment profile capabilities', async () => {
    window.localStorage.setItem(
      KIDITEM_SOURCING_EXTENSION_ID_KEY,
      'sourcing-extension',
    );
    installChrome({
      success: true,
      capabilities: { sourcingProductScraper: true },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        sourcingProductScraper: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBe(
      'sourcing-extension',
    );
  });

  it('requires both the requested order and environment profile capabilities', async () => {
    window.localStorage.setItem(
      KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
      'order-extension',
    );
    installChrome({
      success: true,
      capabilities: { orderCollectionIcecreamMall: true },
    });
    await expect(detectOrderCollectionExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        orderCollectionIcecreamMall: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    await expect(detectOrderCollectionExtensionId(5)).resolves.toBe(
      'order-extension',
    );
  });

  it('distinguishes an installed but incompatible order extension from a missing one', async () => {
    window.localStorage.setItem(
      KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
      'order-extension',
    );
    installChrome({
      success: true,
      version: '0.1.85',
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        browserCollectionSessions: true,
      },
    });

    await expect(detectOrderCollectionExtensionRuntime(5, [
      'browserCollectionSessions',
      'orderCollectionFailureEvidenceV1',
    ])).resolves.toEqual({
      status: 'incompatible',
      extensionId: 'order-extension',
      version: '0.1.85',
      missingCapabilities: ['orderCollectionFailureEvidenceV1'],
    });
  });

  it('reports a compatible order extension with its loaded version', async () => {
    window.localStorage.setItem(
      KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
      'order-extension',
    );
    installChrome({
      success: true,
      version: '0.1.86',
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        browserCollectionSessions: true,
        orderCollectionFailureEvidenceV1: true,
      },
    });

    await expect(detectOrderCollectionExtensionRuntime(5, [
      'browserCollectionSessions',
      'orderCollectionFailureEvidenceV1',
    ])).resolves.toEqual({
      status: 'ready',
      extensionId: 'order-extension',
      version: '0.1.86',
    });
  });

  it('selects a compatible handshake extension when the cached copy is stale', async () => {
    window.localStorage.setItem(
      KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
      'stale-order-extension',
    );
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          sendMessage: (
            id: string,
            _message: unknown,
            callback: (value: PingResponse) => void,
          ) => callback(id === 'current-order-extension'
            ? {
                success: true,
                version: '0.1.87',
                capabilities: {
                  kiditemEnvironmentProfilesV1: true,
                  coupangRocketPoCollectionSessionV1: true,
                },
              }
            : {
                success: true,
                version: '0.1.86',
                capabilities: { kiditemEnvironmentProfilesV1: true },
              }),
        },
      },
    });
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation((message) => {
      if ((message as { type?: string }).type !== 'kiditem:request-order-ext-id') return;
      queueMicrotask(() => {
        for (const extensionId of ['stale-order-extension', 'current-order-extension']) {
          window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'kiditem:order-ext-id', extensionId },
            origin: window.location.origin,
            source: window,
          }));
        }
      });
    });

    await expect(detectOrderCollectionExtensionRuntime(10, [
      'coupangRocketPoCollectionSessionV1',
    ])).resolves.toEqual({
      status: 'ready',
      extensionId: 'current-order-extension',
      version: '0.1.87',
    });
    expect(window.localStorage.getItem(KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY))
      .toBe('current-order-extension');
    postMessage.mockRestore();
  });
});
describe('durable extension command port', () => {
  it('keeps the port open until the Wing form command returns', async () => {
    const messageListeners: Array<(message: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    const disconnect = vi.fn();
    const postMessage = vi.fn((message: unknown) => {
      expect(message).toEqual({ action: 'registerToWingForm', product: { id: 'p1' } });
      queueMicrotask(() => {
        messageListeners.forEach((listener) =>
          listener({ ok: true, submission: { attempted: false } }),
        );
      });
    });
    const connect = vi.fn(() => ({
      postMessage,
      disconnect,
      onMessage: {
        addListener: (listener: (message: unknown) => void) =>
          messageListeners.push(listener),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: (listener: () => void) => disconnectListeners.push(listener),
        removeListener: vi.fn(),
      },
    }));
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { runtime: { lastError: undefined, connect } },
    });

    await expect(
      sendToExtensionViaPort<{ ok: boolean }>(
        'extension-1',
        'kiditem-wing-form-v1',
        { action: 'registerToWingForm', product: { id: 'p1' } },
        1000,
      ),
    ).resolves.toEqual({ ok: true, submission: { attempted: false } });
    expect(connect).toHaveBeenCalledWith('extension-1', {
      name: 'kiditem-wing-form-v1',
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('Sellpia manual-match extension command', () => {
  it('uses the durable manual-match port and validates the reply', async () => {
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const messageListeners: Array<(message: unknown) => void> = [];
    const disconnect = vi.fn();
    const postMessage = vi.fn((message: unknown) => {
      if ((message as { action?: string }).action !== 'collectSellpiaManualMatch') return;
      queueMicrotask(() => messageListeners.forEach((listener) => listener({
        success: true,
        attemptId,
        terminalState: 'COMPLETE',
        continuationRequired: false,
      })));
    });
    const connect = vi.fn(() => ({
      postMessage,
      disconnect,
      onMessage: {
        addListener: (listener: (message: unknown) => void) => messageListeners.push(listener),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    }));
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: { runtime: { lastError: undefined, connect } },
    });

    await expect(collectSellpiaManualMatch(
      'order-extension',
      attemptId,
    )).resolves.toMatchObject({ success: true, attemptId });
    expect(connect).toHaveBeenCalledWith('order-extension', {
      name: KIDITEM_SELLPIA_MANUAL_MATCH_PORT_NAME,
    });
    expect(postMessage).toHaveBeenCalledWith({
      action: 'collectSellpiaManualMatch',
      attemptId,
    });
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('keeps a bounded manual-match scan alive without a fixed total timeout', async () => {
    vi.useFakeTimers();
    const attemptId = '11111111-1111-4111-8111-111111111111';
    const messageListeners: Array<(message: unknown) => void> = [];
    const postMessage = vi.fn();
    const disconnect = vi.fn();
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          connect: vi.fn(() => ({
            postMessage,
            disconnect,
            onMessage: {
              addListener: (listener: (message: unknown) => void) =>
                messageListeners.push(listener),
              removeListener: vi.fn(),
            },
            onDisconnect: {
              addListener: vi.fn(),
              removeListener: vi.fn(),
            },
          })),
        },
      },
    });

    const pending = collectSellpiaManualMatch('order-extension', attemptId);
    expect(postMessage).toHaveBeenNthCalledWith(1, {
      action: 'collectSellpiaManualMatch',
      attemptId,
    });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(postMessage).toHaveBeenNthCalledWith(2, {
      action: 'keepAlive',
    });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(postMessage.mock.calls.length).toBeGreaterThan(2);
    messageListeners.forEach((listener) => listener({
      success: true,
      attemptId,
      terminalState: 'COMPLETE',
      continuationRequired: false,
    }));

    await expect(pending).resolves.toMatchObject({ success: true, attemptId });
    expect(disconnect).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
