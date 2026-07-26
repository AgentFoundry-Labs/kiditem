import { z } from 'zod';
import { SellpiaInventoryCollectionFailureCodeSchema } from '@kiditem/shared/sellpia-inventory-freshness';
import { SellpiaInventoryBrowserSnapshotSchema } from '@kiditem/shared/source-import';
import {
  DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE,
  DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH,
} from '@kiditem/shared/ai';
import { safeStorageGet, safeStorageSet } from './browser-storage';

export const KIDITEM_EXTENSION_ID_KEY = 'kiditem-ext-id';
export const KIDITEM_SOURCING_EXTENSION_ID_KEY = 'kiditem-sourcing-ext-id';
export const KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY = 'kiditem-order-ext-id';
export const KIDITEM_WING_FORM_PORT_NAME = 'kiditem-wing-form-v1';

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    connect?: (id: string, options: { name: string }) => ChromeRuntimePort;
    lastError?: { message?: string };
  };
};

type ChromeRuntimePort = {
  postMessage: (message: unknown) => void;
  disconnect: () => void;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
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

/**
 * Keep an MV3 service worker alive for commands whose browser work can exceed
 * the one-shot message channel lifetime (for example, a full WING form fill).
 */
export function sendToExtensionViaPort<TResponse = unknown>(
  id: string,
  portName: string,
  message: unknown,
  timeoutMs = 15000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const chrome = getChrome();
    if (!chrome?.runtime?.connect) {
      reject(new Error('Chrome 익스텐션 포트 API 미지원'));
      return;
    }
    let settled = false;
    let port: ChromeRuntimePort | null = null;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (port) {
        port.onMessage.removeListener(onMessage);
        port.onDisconnect.removeListener(onDisconnect);
      }
      operation();
      try {
        port?.disconnect();
      } catch {
        // A terminal response may race the extension closing its side.
      }
    };
    const onMessage = (response: unknown) => {
      finish(() => resolve(response as TResponse));
    };
    const onDisconnect = () => {
      const message = chrome.runtime?.lastError?.message;
      finish(() => reject(new Error(message || '익스텐션 포트 연결이 종료되었습니다.')));
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('익스텐션 응답 시간이 초과되었습니다.')));
    }, timeoutMs);

    try {
      port = chrome.runtime.connect(id, { name: portName });
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      port.postMessage(message);
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new Error(String(error))),
      );
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

function supportsEnvironmentProfiles(response: ExtensionPingResponse): boolean {
  return response.capabilities?.kiditemEnvironmentProfilesV1 === true;
}

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
    accepts: supportsEnvironmentProfiles,
  });
}

export async function detectDetailPageRendererExtensionId(
  timeoutMs = 1200,
): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-ext-id',
    responseType: 'kiditem:ext-id',
    timeoutMs,
    accepts: (response) =>
      supportsEnvironmentProfiles(response) &&
      response.capabilities?.detailPageClientRasterV1 === true &&
      response.capabilities?.wingFormPortV1 === true,
  });
}

const DetailPageRasterArtifactSchema = z.object({
  artifactId: z.string().uuid(),
  revisionId: z.string().uuid(),
  imageUrl: z.string().url(),
  outputWidth: z.literal(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH),
  contentType: z.literal(DETAIL_PAGE_CLIENT_RENDER_CONTENT_TYPE),
  byteLength: z.number().int().positive(),
  pixelWidth: z.literal(DETAIL_PAGE_CLIENT_RENDER_OUTPUT_WIDTH),
  pixelHeight: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const DetailPageRasterPortMessageSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('progress'),
    phase: z.enum(['loading', 'capturing', 'uploading', 'finalizing']),
  }).strict(),
  z.object({
    status: z.literal('rendered'),
    artifact: DetailPageRasterArtifactSchema,
  }).strict(),
  z.object({
    status: z.literal('failed'),
    error: z.object({
      code: z.string().min(1).max(64),
      message: z.string().min(1).max(300),
      retryable: z.boolean(),
    }).strict(),
  }).strict(),
]);

export type DetailPageRasterProgressPhase =
  | 'loading'
  | 'capturing'
  | 'uploading'
  | 'finalizing';
export type DetailPageRasterResult = Exclude<
  z.infer<typeof DetailPageRasterPortMessageSchema>,
  { status: 'progress' }
>;

export function renderDetailPageImageWithExtension(
  extensionId: string,
  intentId: string,
  options: {
    onProgress?: (phase: DetailPageRasterProgressPhase) => void;
    timeoutMs?: number;
  } = {},
): Promise<DetailPageRasterResult> {
  return new Promise((resolve, reject) => {
    const chrome = getChrome();
    if (!chrome?.runtime?.connect) {
      reject(new Error('Chrome 익스텐션 포트 API 미지원'));
      return;
    }
    let settled = false;
    let port: ChromeRuntimePort;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      port.onMessage.removeListener(onMessage);
      port.onDisconnect.removeListener(onDisconnect);
      operation();
      try {
        port.disconnect();
      } catch {
        // The extension may already have closed its side after a terminal message.
      }
    };
    const onMessage = (raw: unknown) => {
      const parsed = DetailPageRasterPortMessageSchema.safeParse(raw);
      if (!parsed.success) {
        finish(() => reject(new Error('확장 렌더 응답 형식이 올바르지 않습니다.')));
        return;
      }
      if (parsed.data.status === 'progress') {
        options.onProgress?.(parsed.data.phase);
        return;
      }
      const terminal: DetailPageRasterResult = parsed.data;
      finish(() => resolve(terminal));
    };
    const onDisconnect = () => {
      const message = chrome.runtime?.lastError?.message;
      finish(() => reject(new Error(message || '상세페이지 렌더 확장 연결이 종료되었습니다.')));
    };
    const timeout = window.setTimeout(() => {
      finish(() => reject(new Error('상세페이지 이미지 생성 시간이 초과되었습니다.')));
    }, options.timeoutMs ?? 60_000);

    try {
      port = chrome.runtime.connect(extensionId, {
        name: 'kiditem-detail-page-raster-v1',
      });
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      port.postMessage({ action: 'renderDetailPageImage', intentId });
    } catch (error) {
      window.clearTimeout(timeout);
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function detectSourcingExtensionId(timeoutMs = 1200): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_SOURCING_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-sourcing-ext-id',
    responseType: 'kiditem:sourcing-ext-id',
    timeoutMs,
    accepts: (response) =>
      supportsEnvironmentProfiles(response) &&
      response.capabilities?.sourcingProductScraper === true,
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
      supportsEnvironmentProfiles(response) &&
      (requiredCapability === null ||
        response.capabilities?.[requiredCapability] === true),
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
