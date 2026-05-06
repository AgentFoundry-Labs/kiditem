/**
 * Talks to the kiditem Chrome extension to scrape Coupang Wing inventory rows
 * for the matching center. Mirrors the flow used by `useCoupangImageSync` —
 * the extension and message format are shared, but reconciliation rows do
 * not need the image URL to be required (we keep it when present).
 */

import type { ReconciliationRow } from '@kiditem/shared/channel-reconciliation';

interface CoupangInventoryRow {
  inventoryId: string;
  legacyCode?: string | null;
  name: string;
  url: string;
}

interface ExtensionMessageResponse {
  success?: boolean;
  error?: string;
  pendingLogin?: boolean;
  rows?: CoupangInventoryRow[];
  total?: number;
}

type ChromeRuntime = {
  runtime?: {
    sendMessage?: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    lastError?: { message?: string };
  };
};

const EXTENSION_ID_KEY = 'kiditem-ext-id';

function getChrome(): ChromeRuntime | undefined {
  return (window as unknown as { chrome?: ChromeRuntime }).chrome;
}

function sendToExtension(id: string, message: unknown): Promise<ExtensionMessageResponse> {
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
        resolve(response as ExtensionMessageResponse);
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

async function detectExtensionId(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const tryPing = async (id: string): Promise<boolean> => {
    try {
      const response = await sendToExtension(id, { action: 'ping' });
      return !!response?.success;
    } catch {
      return false;
    }
  };

  const stored = window.localStorage.getItem(EXTENSION_ID_KEY);
  if (stored && (await tryPing(stored))) return stored;

  const fromHandshake = await new Promise<string | null>((resolve) => {
    let done = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; extensionId?: string } | null;
      if (!data || data.type !== 'kiditem:ext-id' || !data.extensionId) return;
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      window.localStorage.setItem(EXTENSION_ID_KEY, data.extensionId);
      resolve(data.extensionId);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'kiditem:request-ext-id' }, window.location.origin);
    window.setTimeout(() => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, 1200);
  });

  if (fromHandshake && (await tryPing(fromHandshake))) return fromHandshake;
  return null;
}

export async function scrapeReconciliationRows(): Promise<ReconciliationRow[]> {
  const extensionId = await detectExtensionId();
  if (!extensionId) {
    throw new Error(
      'kiditem 크롬 익스텐션을 찾을 수 없습니다 — 쿠팡 Wing 페이지에서 익스텐션을 먼저 활성화하세요.',
    );
  }

  const response = await sendToExtension(extensionId, {
    action: 'scrapeCoupangImageRows',
  });
  if (!response?.success) {
    throw new Error(
      response?.error ??
        (response?.pendingLogin
          ? '쿠팡 Wing 로그인 필요 — 열린 Wing 창에서 로그인 후 다시 시도하세요.'
          : '쿠팡 익스텐션 row 수집 실패'),
    );
  }

  const rows = Array.isArray(response.rows) ? response.rows : [];
  // Reconciliation contract: externalId is the Coupang side identifier.
  // The Wing extension currently calls it `inventoryId`; remap here so the
  // server contract is consistent regardless of extension version.
  return rows
    .filter((r) => r.inventoryId)
    .map(
      (r): ReconciliationRow => ({
        externalId: r.inventoryId,
        legacyCode: r.legacyCode ?? null,
        channelProductName: r.name ?? null,
        channelImageUrl: r.url ?? null,
      }),
    );
}
