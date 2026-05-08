export const KIDITEM_EXTENSION_ID_KEY = 'kiditem-ext-id';

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

export function sendToExtension<TResponse = unknown>(
  id: string,
  message: unknown,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    try {
      const chrome = getChrome();
      if (!chrome?.runtime?.sendMessage) {
        reject(new Error('Chrome 익스텐션 API 미지원'));
        return;
      }
      chrome.runtime.sendMessage(id, message, (response: unknown) => {
        if (chrome.runtime?.lastError) {
          reject(new Error(chrome.runtime.lastError.message ?? '익스텐션 통신 실패'));
          return;
        }
        resolve(response as TResponse);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function detectExtensionId(timeoutMs = 1200): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string): Promise<boolean> => {
    try {
      const response = await sendToExtension<{ success?: boolean }>(id, { action: 'ping' });
      return !!response?.success;
    } catch {
      return false;
    }
  };

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(KIDITEM_EXTENSION_ID_KEY);
  } catch {
    stored = null;
  }
  if (stored && (await tryPing(stored))) return stored;

  const fromHandshake = await new Promise<string | null>((resolve) => {
    let done = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; extensionId?: string } | null;
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!data || data.type !== 'kiditem:ext-id' || !data.extensionId) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(data.extensionId);
    };

    window.addEventListener('message', onMessage);
    try {
      window.postMessage({ type: 'kiditem:request-ext-id' }, window.location.origin);
    } catch {
      /* noop */
    }
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, timeoutMs);
  });

  if (fromHandshake && (await tryPing(fromHandshake))) {
    try {
      window.localStorage.setItem(KIDITEM_EXTENSION_ID_KEY, fromHandshake);
    } catch {
      /* noop */
    }
    return fromHandshake;
  }
  return null;
}
