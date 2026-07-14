import {
  detectSourcingExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import type { LiveCommerceSource } from './live-commerce-api';

const REQUEST_TIMEOUT_MS = 90_000;
export const LIVE_COMMERCE_EXTENSION_MIN_VERSION = '2.2.2';

interface ExtensionResponse {
  success?: boolean;
  error?: string;
  version?: string;
  runId?: string;
  status?: string;
  source?: LiveCommerceSource;
  broadcastCount?: number;
  productCount?: number;
  businessDate?: string | null;
  capabilities?: {
    sourcingLiveCommerceCollector?: boolean;
    browserCollectionSessions?: boolean;
  };
}

export type LiveCommerceExtensionErrorCode =
  | 'chrome_required'
  | 'extension_missing'
  | 'extension_reload_required'
  | 'attention_required'
  | 'collection_cancelled'
  | 'collection_failed';

export class LiveCommerceExtensionError extends Error {
  constructor(
    public readonly code: LiveCommerceExtensionErrorCode,
    message: string,
    public readonly runId: string | null = null,
  ) {
    super(message);
    this.name = 'LiveCommerceExtensionError';
  }
}

export interface LiveCommerceExtensionReadiness {
  configured: boolean;
  message: string;
}

export async function fetchLiveCommerceExtensionReadiness(): Promise<LiveCommerceExtensionReadiness> {
  if (!isChromeExtensionRuntimeAvailable()) {
    return { configured: false, message: 'Chrome에서 KidItem을 열어주세요.' };
  }
  const extensionId = await detectSourcingExtensionId();
  if (!extensionId) {
    return { configured: false, message: 'Auto-Seller 확장프로그램 설치 필요' };
  }
  try {
    const ping = await sendToExtension<ExtensionResponse>(
      extensionId,
      { action: 'ping' },
      8_000,
    );
    return ping?.capabilities?.sourcingLiveCommerceCollector &&
      ping.capabilities.browserCollectionSessions &&
      isVersionAtLeast(ping.version, LIVE_COMMERCE_EXTENSION_MIN_VERSION)
      ? { configured: true, message: '방송 URL 수집 준비 완료' }
      : { configured: false, message: 'chrome://extensions에서 확장 새로고침 필요' };
  } catch {
    return { configured: false, message: '확장프로그램 응답 없음 · 새로고침 필요' };
  }
}

export async function collectLiveCommerceFromChrome(
  url: string,
  runId?: string,
): Promise<{
  runId: string;
  source: LiveCommerceSource;
  broadcastCount: number;
  productCount: number;
  businessDate: string | null;
}> {
  const normalized = url.trim();
  if (!normalized) {
    throw new LiveCommerceExtensionError(
      'collection_failed',
      '1688 또는 도우인 방송 URL을 입력해주세요.',
    );
  }
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new LiveCommerceExtensionError(
      'chrome_required',
      '로그인된 방송 수집은 Chrome 확장프로그램에서 실행됩니다. 같은 Chrome에서 KidItem을 열어주세요.',
    );
  }
  const extensionId = await detectSourcingExtensionId();
  if (!extensionId) {
    throw new LiveCommerceExtensionError(
      'extension_missing',
      'Auto-Seller Product Scraper 확장프로그램을 설치하거나 새로고침해주세요.',
    );
  }
  const ping = await sendToExtension<ExtensionResponse>(
    extensionId,
    { action: 'ping' },
    8_000,
  );
  if (
    !ping?.capabilities?.sourcingLiveCommerceCollector ||
    !ping.capabilities.browserCollectionSessions ||
    !isVersionAtLeast(ping.version, LIVE_COMMERCE_EXTENSION_MIN_VERSION)
  ) {
    throw new LiveCommerceExtensionError(
      'extension_reload_required',
      '중국 라이브 수집 기능이 없는 확장 버전입니다. chrome://extensions에서 확장프로그램을 새로고침해주세요.',
    );
  }
  const result = await sendToExtension<ExtensionResponse>(
    extensionId,
    {
      action: 'collectLiveCommerceUrl',
      url: normalized,
      ...(runId ? { runId } : {}),
    },
    REQUEST_TIMEOUT_MS,
  );
  if (!result?.success || !result.source || !result.runId) {
    throw new LiveCommerceExtensionError(
      result?.status === 'attention_required'
        ? 'attention_required'
        : result?.status === 'cancelled'
          ? 'collection_cancelled'
          : 'collection_failed',
      result?.error ?? '방송 수집에 실패했습니다.',
      result?.runId ?? null,
    );
  }
  return {
    runId: result.runId,
    source: result.source,
    broadcastCount: countValue(result.broadcastCount),
    productCount: countValue(result.productCount),
    businessDate: typeof result.businessDate === 'string' ? result.businessDate : null,
  };
}

function countValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isVersionAtLeast(current: string | undefined, minimum: string): boolean {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const minimumParts = minimum.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const size = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < size; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const minimumValue = minimumParts[index] ?? 0;
    if (currentValue > minimumValue) return true;
    if (currentValue < minimumValue) return false;
  }
  return true;
}
