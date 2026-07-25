import { safeStorageGet, safeStorageSet } from './browser-storage';
import { z } from 'zod';
import { SellpiaInventoryCollectionFailureCodeSchema } from '@kiditem/shared/sellpia-inventory-freshness';
import { SellpiaInventoryBrowserSnapshotSchema } from '@kiditem/shared/source-import';

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

// MV3 서비스워커는 유휴 시 잠들며, 잠든 워커로의 첫 메시지는 크롬이
// "Receiving end does not exist" / "Could not establish connection" 로 떨군다.
// 이 경우에만 워커가 깨어날 시간을 주고 재시도한다(다른 오류는 즉시 전파).
const EXTENSION_WAKE_RETRY_DELAYS_MS = [250, 600, 1200];

function isExtensionWakeError(message: string | undefined): boolean {
  if (!message) return false;
  return /Receiving end does not exist|Could not establish connection/i.test(message);
}

const extensionWakeDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export async function sendToExtension<TResponse = unknown>(
  id: string,
  message: unknown,
  timeoutMs = 15000,
): Promise<TResponse> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= EXTENSION_WAKE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await sendToExtensionOnce<TResponse>(id, message, timeoutMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (
        isExtensionWakeError(lastError.message) &&
        attempt < EXTENSION_WAKE_RETRY_DELAYS_MS.length
      ) {
        await extensionWakeDelay(EXTENSION_WAKE_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error('익스텐션 통신 실패');
}

function sendToExtensionOnce<TResponse = unknown>(
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

  const stored = safeStorageGet('local', options.storageKey);
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
    safeStorageSet('local', options.storageKey, fromHandshake);
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

export async function detectOrderCollectionExtensionId(
  timeoutMs = 1200,
  requiredCapability: string | null = 'orderCollectionIcecreamMall',
): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-order-ext-id',
    responseType: 'kiditem:order-ext-id',
    timeoutMs,
    accepts: (response) =>
      requiredCapability === null || response.capabilities?.[requiredCapability] === true,
  });
}

const SellpiaInventoryExtensionReplySchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    runId: z.string().uuid(),
    snapshot: SellpiaInventoryBrowserSnapshotSchema,
    sourceOrigin: z.literal('https://kiditem.sellpia.com'),
    sourceAccountKey: z.literal('kiditem'),
  }).passthrough(),
  z.object({
    success: z.literal(false),
    runId: z.string().uuid(),
    errorCode: SellpiaInventoryCollectionFailureCodeSchema,
    error: z.string().min(1).max(300),
  }).passthrough(),
]);

export type SellpiaInventoryExtensionReply = z.infer<
  typeof SellpiaInventoryExtensionReplySchema
>;

export async function collectSellpiaInventory(
  extensionId: string,
  runId: string,
): Promise<SellpiaInventoryExtensionReply> {
  const response = await sendToExtension<unknown>(extensionId, {
    action: 'collectSellpiaInventory',
    runId,
  }, 90_000);
  const parsed = SellpiaInventoryExtensionReplySchema.parse(response);
  if (parsed.runId !== runId) {
    throw new Error('Sellpia inventory extension returned a mismatched run ID');
  }
  return parsed;
}

export async function detectBrowserCollectionExtensionIds(): Promise<string[]> {
  const ids = await Promise.all([
    detectExtensionId(),
    detectSourcingExtensionId(),
    detectOrderCollectionExtensionId(),
  ]);
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
