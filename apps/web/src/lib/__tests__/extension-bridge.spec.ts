import { beforeEach, describe, expect, it } from 'vitest';
import {
  KIDITEM_EXTENSION_ID_KEY,
  KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
  KIDITEM_SOURCING_EXTENSION_ID_KEY,
  detectExtensionId,
  detectOrderCollectionExtensionId,
  detectSourcingExtensionId,
} from '../extension-bridge';

type PingResponse = {
  success: boolean;
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
});
