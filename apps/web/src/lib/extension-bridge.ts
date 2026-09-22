import { z } from 'zod';
import { safeStorageGet, safeStorageSet } from './browser-storage';

export const KIDITEM_EXTENSION_ID_KEY = 'kiditem-ext-id';
export const KIDITEM_SOURCING_EXTENSION_ID_KEY = 'kiditem-sourcing-ext-id';
export const KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY = 'kiditem-order-ext-id';
export const KIDITEM_WING_FORM_PORT_NAME = 'kiditem-wing-form-v1';
export const KIDITEM_SELLPIA_MANUAL_MATCH_PORT_NAME =
  'kiditem-sellpia-manual-match-v1';

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

type ExtensionPortCommandOptions = {
  timeoutMs?: number | null;
  keepAlive?: {
    intervalMs: number;
    message: unknown;
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

/**
 * 확장이 제 시간에 답하지 않았다는 말. 몰이 실패한 것도, 로그인이 풀린 것도 아니다 — 우리가
 * 물어봤는데 못 들었을 뿐이다. 부르는 쪽이 이 상수로 알아보고 '실패'와 다르게 다룬다.
 */
export const EXTENSION_TIMEOUT_MESSAGE = '익스텐션 응답 시간이 초과되었습니다.';

function isExtensionWakeError(message: string | undefined): boolean {
  if (!message) return false;
  return /Receiving end does not exist|Could not establish connection/i.test(message);
}

const extensionWakeDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export async function sendToExtension<TResponse = unknown>(
  id: string,
  message: unknown,
  timeoutMs: number | null = 15000,
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
  timeoutMs: number | null = 15000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: number | null = null;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) window.clearTimeout(timeout);
      fn();
    };
    if (timeoutMs !== null) {
      timeout = window.setTimeout(() => {
        settle(() => reject(new Error(EXTENSION_TIMEOUT_MESSAGE)));
      }, timeoutMs);
    }

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
  timeoutOrOptions: number | null | ExtensionPortCommandOptions = 15000,
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const options: ExtensionPortCommandOptions =
      typeof timeoutOrOptions === 'object' && timeoutOrOptions !== null
      ? timeoutOrOptions
      : { timeoutMs: timeoutOrOptions };
    const timeoutMs = options.timeoutMs === undefined ? 15000 : options.timeoutMs;
    const keepAlive = options.keepAlive;
    const chrome = getChrome();
    if (!chrome?.runtime?.connect) {
      reject(new Error('Chrome 익스텐션 포트 API 미지원'));
      return;
    }
    let settled = false;
    let port: ChromeRuntimePort | null = null;
    let timeout: number | null = null;
    let keepAliveTimer: number | null = null;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) window.clearTimeout(timeout);
      if (keepAliveTimer !== null) window.clearTimeout(keepAliveTimer);
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
    const scheduleKeepAlive = () => {
      if (!keepAlive || settled) return;
      keepAliveTimer = window.setTimeout(() => {
        if (settled || !port) return;
        try {
          port.postMessage(keepAlive.message);
          scheduleKeepAlive();
        } catch (error) {
          finish(() => reject(
            error instanceof Error ? error : new Error(String(error)),
          ));
        }
      }, keepAlive.intervalMs);
    };
    if (timeoutMs !== null) {
      timeout = window.setTimeout(() => {
        finish(() => reject(new Error(EXTENSION_TIMEOUT_MESSAGE)));
      }, timeoutMs);
    }

    try {
      port = chrome.runtime.connect(id, { name: portName });
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      port.postMessage(message);
      scheduleKeepAlive();
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new Error(String(error))),
      );
    }
  });
}

type ExtensionPingResponse = {
  success?: boolean;
  version?: string;
  capabilities?: Record<string, unknown>;
};

export type ExtensionRuntimeStatus =
  | {
    status: 'ready';
    extensionId: string;
    version: string;
  }
  | {
    status: 'incompatible';
    extensionId: string;
    version: string;
    missingCapabilities: string[];
  }
  | { status: 'not_found' };

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

function requestExtensionIdFromHandshake(
  options: Pick<DetectExtensionOptions, 'requestType' | 'responseType' | 'timeoutMs'>,
): Promise<string | null> {
  return new Promise((resolve) => {
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
}

function requestExtensionIdsFromHandshake(
  options: Pick<DetectExtensionOptions, 'requestType' | 'responseType' | 'timeoutMs'>,
): Promise<string[]> {
  return new Promise((resolve) => {
    const extensionIds = new Set<string>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve([...extensionIds]);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; extensionId?: string } | null;
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!data || data.type !== options.responseType || !data.extensionId) return;
      extensionIds.add(data.extensionId);
    };

    window.addEventListener('message', onMessage);
    try {
      window.postMessage({ type: options.requestType }, window.location.origin);
    } catch {
      finish();
      return;
    }
    window.setTimeout(finish, options.timeoutMs);
  });
}

/**
 * 잠든 서비스워커를 깨우는 데 드는 시간.
 *
 * MV3 서비스워커는 놀면 내려간다. 확장을 갓 리로드한 직후나 한동안 안 쓴 뒤의
 * 첫 `ping` 은 워커가 모듈을 다시 읽는 시간을 포함한다. 라이브 실측(2026-09-10)에서
 * **따뜻한 상태의 왕복이 0.28~0.89초**였다 — 예전 제한 1.2초는 콜드 스타트를 못 버틴다.
 *
 * 못 버티면 화면은 "확장을 찾지 못했습니다"라고 말하고, 사람은 멀쩡한 확장을
 * 또 리로드한다. 없는 확장과 잠든 확장을 구별하지 못한 것이 원인이었다.
 */
const EXTENSION_WAKE_TIMEOUT_MS = 6000;

async function detectExtensionIdWithHandshake(options: DetectExtensionOptions): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string, timeoutMs: number): Promise<boolean> => {
    try {
      const response = await sendToExtension<ExtensionPingResponse>(id, { action: 'ping' }, timeoutMs);
      return !!response?.success && options.accepts(response);
    } catch {
      return false;
    }
  };

  const stored = safeStorageGet('local', options.storageKey);
  if (stored) {
    // 첫 번째는 짧게 — 있으면 대개 바로 답한다.
    if (await tryPing(stored, options.timeoutMs)) return stored;
    // 안 오면 자고 있는 것으로 보고 한 번 더, 깨어날 시간을 준다.
    if (await tryPing(stored, EXTENSION_WAKE_TIMEOUT_MS)) return stored;
  }

  const fromHandshake = await requestExtensionIdFromHandshake(options);

  if (fromHandshake && (await tryPing(fromHandshake, EXTENSION_WAKE_TIMEOUT_MS))) {
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

export async function detectWingFormExtensionId(
  timeoutMs = 1200,
): Promise<string | null> {
  return detectExtensionIdWithHandshake({
    storageKey: KIDITEM_EXTENSION_ID_KEY,
    requestType: 'kiditem:request-ext-id',
    responseType: 'kiditem:ext-id',
    timeoutMs,
    accepts: (response) =>
      supportsEnvironmentProfiles(response) &&
      response.capabilities?.wingFormPortV1 === true,
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

export async function detectOrderCollectionExtensionRuntime(
  timeoutMs = 1200,
  requiredCapabilities: string[] = ['orderCollectionIcecreamMall'],
  /**
   * How long the extension this browser already knows gets to answer. A worker
   * busy with other malls answers a ping late; late is not missing. Discovery
   * of an unknown extension keeps `timeoutMs`.
   */
  knownProbeTimeoutMs = timeoutMs,
): Promise<ExtensionRuntimeStatus> {
  if (typeof window === 'undefined') return { status: 'not_found' };
  const capabilities = [...new Set([
    'kiditemEnvironmentProfilesV1',
    ...requiredCapabilities,
  ])];
  const probe = async (
    extensionId: string,
    probeTimeoutMs = timeoutMs,
  ): Promise<ExtensionRuntimeStatus | null> => {
    try {
      const response = await sendToExtension<ExtensionPingResponse>(
        extensionId,
        { action: 'ping' },
        probeTimeoutMs,
      );
      if (!response?.success) return null;
      const version = typeof response.version === 'string' && response.version.length > 0
        ? response.version
        : 'unknown';
      const missingCapabilities = capabilities.filter(
        (capability) => response.capabilities?.[capability] !== true,
      );
      return missingCapabilities.length === 0
        ? { status: 'ready', extensionId, version }
        : { status: 'incompatible', extensionId, version, missingCapabilities };
    } catch {
      return null;
    }
  };

  const stored = safeStorageGet('local', KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY);
  const storedStatus = stored ? await probe(stored, knownProbeTimeoutMs) : null;
  if (storedStatus?.status === 'ready') return storedStatus;

  const fromHandshake = await requestExtensionIdsFromHandshake({
    requestType: 'kiditem:request-order-ext-id',
    responseType: 'kiditem:order-ext-id',
    timeoutMs,
  });
  const handshakeStatuses = await Promise.all(
    fromHandshake
      .filter((extensionId) => extensionId !== stored)
      .map((extensionId) => probe(extensionId)),
  );
  const ready = handshakeStatuses.find((status) => status?.status === 'ready');
  if (ready?.status === 'ready') {
    safeStorageSet('local', KIDITEM_ORDER_COLLECTION_EXTENSION_ID_KEY, ready.extensionId);
    return ready;
  }
  const incompatible = handshakeStatuses.find(
    (status) => status?.status === 'incompatible',
  );
  return incompatible ?? storedStatus ?? { status: 'not_found' };
}

const SellpiaManualMatchExtensionReplySchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    attemptId: z.string().uuid(),
    terminalState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    continuationRequired: z.boolean(),
  }).strict(),
  z.object({
    success: z.literal(false),
    attemptId: z.string().uuid(),
    terminalState: z.enum(['RUNNING', 'COMPLETE', 'FAILED']),
    continuationRequired: z.boolean(),
    errorCode: z.string().min(1).max(100).optional(),
    error: z.string().min(1).max(300),
  }).strict(),
]);

export type SellpiaManualMatchExtensionReply = z.infer<
  typeof SellpiaManualMatchExtensionReplySchema
>;

export async function collectSellpiaManualMatch(
  extensionId: string,
  attemptId: string,
): Promise<SellpiaManualMatchExtensionReply> {
  const response = await sendToExtensionViaPort<unknown>(
    extensionId,
    KIDITEM_SELLPIA_MANUAL_MATCH_PORT_NAME,
    {
      action: 'collectSellpiaManualMatch',
      attemptId,
    },
    {
      timeoutMs: null,
      keepAlive: {
        intervalMs: 15_000,
        message: { action: 'keepAlive' },
      },
    },
  );
  const parsed = SellpiaManualMatchExtensionReplySchema.parse(response);
  if (parsed.attemptId !== attemptId) {
    throw new Error('Sellpia manual-match extension returned a mismatched attempt ID');
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
