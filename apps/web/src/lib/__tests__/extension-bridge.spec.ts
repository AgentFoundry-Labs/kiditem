import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KIDITEM_EXTENSION_ID_KEY,
  KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
  KIDITEM_SOURCING_EXTENSION_ID_KEY,
  detectExtensionId,
  detectOrderCollectionExtensionId,
  detectOrderCollectionExtensionRuntime,
  detectSourcingExtensionId,
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

  it('requires the sourcing operation kinds (KID-360) and environment profile capabilities', async () => {
    window.localStorage.setItem(
      KIDITEM_SOURCING_EXTENSION_ID_KEY,
      'sourcing-extension',
    );
    installChrome({
      success: true,
      capabilities: { sourcingOperationKindsV1: true },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBeNull();

    // 새 런타임은 있지만 소싱 kind가 없는 빌드(KID-357)는 소싱 수집을 돌리지 못한다.
    installChrome({
      success: true,
      capabilities: { operationRuntime: true, kiditemEnvironmentProfilesV1: true },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBeNull();

    // 옛 소싱 워커의 표시만 있는 확장은 소싱 수집을 돌리지 못한다.
    installChrome({
      success: true,
      capabilities: { sourcingProductScraper: true, kiditemEnvironmentProfilesV1: true },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBeNull();

    installChrome({
      success: true,
      capabilities: {
        operationRuntime: true,
        sourcingOperationKindsV1: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    await expect(detectSourcingExtensionId(5)).resolves.toBe(
      'sourcing-extension',
    );
  });

  it('finds the order extension by the new runtime capability by default, not the old worker flag', async () => {
    window.localStorage.setItem(
      KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
      'order-extension',
    );
    installChrome({
      success: true,
      capabilities: { operationRuntime: true },
    });
    await expect(detectOrderCollectionExtensionId(5)).resolves.toBeNull();

    // 옛 워커 표시만 있는 확장은 새 런타임이 없으면 기본 감지에 잡히지 않는다(KID-366).
    installChrome({
      success: true,
      capabilities: {
        orderCollectionIcecreamMall: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    await expect(detectOrderCollectionExtensionId(5)).resolves.toBeNull();
    await expect(detectOrderCollectionExtensionRuntime(5)).resolves.toMatchObject({
      status: 'incompatible',
      missingCapabilities: ['operationRuntime'],
    });

    installChrome({
      success: true,
      version: '1.3.0',
      capabilities: {
        operationRuntime: true,
        kiditemEnvironmentProfilesV1: true,
      },
    });
    await expect(detectOrderCollectionExtensionId(5)).resolves.toBe(
      'order-extension',
    );
    await expect(detectOrderCollectionExtensionRuntime(5)).resolves.toEqual({
      status: 'ready',
      extensionId: 'order-extension',
      version: '1.3.0',
    });
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

  /**
   * 2026-09-18 전체 수집: 다른 몰 파일을 만드느라 바쁜 워커가 핑에 1.2초를 넘겨 답했고, 멀쩡한
   * 확장이 '찾지 못했습니다'로 떨어져 GS샵 · 쿠팡직배송이 시작도 못 했다. 이미 아는 확장은
   * 더 기다린다 — 늦게 답한 것은 없는 것이 아니다.
   */
  it('waits longer for the extension it already knows than for discovery', async () => {
    window.localStorage.setItem(KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY, 'order-extension');
    Object.defineProperty(window, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          lastError: undefined,
          sendMessage: (_id: string, _message: unknown, callback: (value: PingResponse) => void) => {
            // A busy worker: answers after 60 ms, past a 20 ms discovery window.
            window.setTimeout(() => callback({
              success: true,
              version: '1.2.2',
              capabilities: { kiditemEnvironmentProfilesV1: true, browserCollectionSessions: true },
            }), 60);
          },
        },
      },
    });

    await expect(detectOrderCollectionExtensionRuntime(20, ['browserCollectionSessions']))
      .resolves.toEqual({ status: 'not_found' });
    await expect(detectOrderCollectionExtensionRuntime(20, ['browserCollectionSessions'], 500))
      .resolves.toEqual({ status: 'ready', extensionId: 'order-extension', version: '1.2.2' });
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
