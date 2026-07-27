import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KIDITEM_EXTENSION_ID_KEY,
  KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
  KIDITEM_SOURCING_EXTENSION_ID_KEY,
  detectExtensionId,
  detectDetailPageRendererExtensionId,
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  detectSourcingExtensionId,
  renderDetailPageImageWithExtension,
  sendToExtensionViaPort,
} from '../extension-bridge';

type PingResponse = {
  success: boolean;
  version?: string;
  capabilities?: Record<string, unknown>;
};

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

  it('requires both client raster and durable Wing form port capabilities', async () => {
    window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, 'coupang-extension');
    installChrome({
      success: true,
      capabilities: { kiditemEnvironmentProfilesV1: true },
    });
    await expect(detectDetailPageRendererExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        detailPageClientRasterV1: true,
      },
    });
    await expect(detectDetailPageRendererExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        kiditemEnvironmentProfilesV1: true,
        detailPageClientRasterV1: true,
        wingFormPortV1: true,
      },
    });
    await expect(detectDetailPageRendererExtensionId(5)).resolves.toBe(
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

describe('detail-page renderer extension port', () => {
  it('forwards progress and resolves one rendered terminal message', async () => {
    const messageListeners: Array<(message: unknown) => void> = [];
    const disconnectListeners: Array<() => void> = [];
    const disconnect = vi.fn();
    const postMessage = vi.fn((message: unknown) => {
      expect(message).toEqual({
        action: 'renderDetailPageImage',
        intentId: '77777777-7777-4777-8777-777777777777',
      });
      queueMicrotask(() => {
        messageListeners.forEach((listener) =>
          listener({ status: 'progress', phase: 'capturing' }),
        );
        messageListeners.forEach((listener) =>
          listener({
            status: 'rendered',
            artifact: {
              artifactId: '88888888-8888-4888-8888-888888888888',
              revisionId: '55555555-5555-4555-8555-555555555555',
              imageUrl: 'https://cdn.example.com/detail.jpg',
              outputWidth: 780,
              contentType: 'image/jpeg',
              byteLength: 2048,
              pixelWidth: 780,
              pixelHeight: 7846,
              sha256: 'a'.repeat(64),
            },
          }),
        );
      });
    });
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
              addListener: (listener: () => void) => disconnectListeners.push(listener),
              removeListener: vi.fn(),
            },
          })),
        },
      },
    });
    const onProgress = vi.fn();

    await expect(
      renderDetailPageImageWithExtension(
        'extension-1',
        '77777777-7777-4777-8777-777777777777',
        { onProgress, timeoutMs: 1000 },
      ),
    ).resolves.toMatchObject({ status: 'rendered' });
    expect(onProgress).toHaveBeenCalledWith('capturing');
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('rejects when the renderer port disconnects before a terminal message', async () => {
    const disconnectListeners: Array<() => void> = [];
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          lastError: { message: 'service worker stopped' },
          connect: vi.fn(() => ({
            postMessage: () => queueMicrotask(() =>
              disconnectListeners.forEach((listener) => listener()),
            ),
            disconnect: vi.fn(),
            onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
            onDisconnect: {
              addListener: (listener: () => void) => disconnectListeners.push(listener),
              removeListener: vi.fn(),
            },
          })),
        },
      },
    });

    await expect(
      renderDetailPageImageWithExtension(
        'extension-1',
        '77777777-7777-4777-8777-777777777777',
        { timeoutMs: 1000 },
      ),
    ).rejects.toThrow(/service worker stopped/);
  });
});
