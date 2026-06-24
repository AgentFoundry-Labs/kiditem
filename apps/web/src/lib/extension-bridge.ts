export const KIDITEM_EXTENSION_ID_KEY = 'kiditem-ext-id';
export const KIDITEM_SOURCING_EXTENSION_ID_KEY = 'kiditem-sourcing-ext-id';
export const KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY = 'kiditem-order-ext-id';

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    lastError?: { message?: string };
  };
};

type WindowWithChrome = Window & { chrome?: ChromeRuntime };

function getChrome(): ChromeRuntime | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as WindowWithChrome).chrome;
}

export function isChromeExtensionRuntimeAvailable(): boolean {
  return typeof getChrome()?.runtime?.sendMessage === 'function';
}

export function sendToExtension<TResponse = unknown>(
  id: string,
  message: unknown,
  timeoutMs = 15000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      fn();
    };
    const timeout = window.setTimeout(() => {
      settle(() => reject(new Error('익스텐션 응답 시간이 초과되었습니다.')));
    }, timeoutMs);

    try {
      const chrome = getChrome();
      if (!chrome?.runtime?.sendMessage) {
        settle(() => reject(new Error('Chrome 익스텐션 API 미지원')));
        return;
      }
      chrome.runtime.sendMessage(id, message, (response: unknown) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          settle(() =>
            reject(new Error(lastError.message ?? '익스텐션 통신 실패')),
          );
          return;
        }
        settle(() => resolve(response as TResponse));
      });
    } catch (error) {
      settle(() => reject(error instanceof Error ? error : new Error(String(error))));
    }
  });
}

type ExtensionPingResponse = {
  success?: boolean;
  capabilities?: Record<string, unknown>;
};

type DetectExtensionOptions = {
  storageKey: string;
  requestType: string;
  responseType: string;
  timeoutMs: number;
  accepts: (response: ExtensionPingResponse) => boolean;
};

async function detectExtensionIdWithHandshake(options: DetectExtensionOptions): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string): Promise<boolean> => {
    try {
      const response = await sendToExtension<ExtensionPingResponse>(id, { action: 'ping' }, options.timeoutMs);
      return !!response?.success && options.accepts(response);
    } catch {
      return false;
    }
  };

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(options.storageKey);
  } catch {
    stored = null;
  }
  if (stored && (await tryPing(stored))) return stored;

  const fromHandshake = await new Promise<string | null>((resolve) => {
    let done = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; extensionId?: string } | null;
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!data || data.type !== options.responseType || !data.extensionId) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(data.extensionId);
    };

    window.addEventListener('message', onMessage);
    try {
      window.postMessage({ type: options.requestType }, window.location.origin);
    } catch {
      /* noop */
    }
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, options.timeoutMs);
  });

  if (fromHandshake && (await tryPing(fromHandshake))) {
    try {
      window.localStorage.setItem(options.storageKey, fromHandshake);
    } catch {
      /* noop */
    }
    return fromHandshake;
  }
  return null;
}

export async function detectExtensionId(timeoutMs = 1200): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-ext-id',
    responseType: 'kiditem:ext-id',
    timeoutMs,
    accepts: () => true,
  });
}

export async function detectSourcingExtensionId(timeoutMs = 1200): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_SOURCING_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-sourcing-ext-id',
    responseType: 'kiditem:sourcing-ext-id',
    timeoutMs,
    accepts: (response) => response.capabilities?.sourcingProductScraper === true,
  });
}

export async function detectOrderCollectionExtensionId(timeoutMs = 1200): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-order-ext-id',
    responseType: 'kiditem:order-ext-id',
    timeoutMs,
    accepts: (response) => response.capabilities?.orderCollectionIcecreamMall === true,
  });
}
