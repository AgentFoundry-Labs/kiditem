import {
  CoupangCatalogBrowserStatusSchema,
  type CoupangCatalogBrowserStatus,
  type CoupangCatalogCollectionPermit,
} from '@kiditem/shared/coupang-catalog-snapshot';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';
import { KIDITEM_EXTENSION_MIN_VERSION } from '@/lib/extension-version';
import { transferExtensionAuthTo } from '@/lib/extension-auth';

type ExtensionResponse = {
  success?: boolean;
  started?: boolean;
  error?: string;
  version?: string;
  capabilities?: Record<string, unknown>;
};

// 통합 확장(kiditem-os)은 세 확장을 합치며 버전을 1.0.0 으로 리셋했다. 개별
// 기능 판정은 아래 ping capability 가 하고, 버전은 병합 이전 설치만 걸러낸다.
export const COUPANG_CATALOG_EXTENSION_MIN_VERSION = KIDITEM_EXTENSION_MIN_VERSION;

export const COUPANG_CATALOG_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치하고 새로고침한 뒤 다시 시도하세요.';
export const COUPANG_CATALOG_EXTENSION_RELOAD_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램이 이전 버전입니다. chrome://extensions에서 새로고침한 뒤 다시 시도하세요.';

export async function startCoupangCatalogBrowser(input: {
  permit: CoupangCatalogCollectionPermit;
}): Promise<string> {
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new Error('쿠팡 상품 수집은 Chrome에서 실행해주세요.');
  }
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(COUPANG_CATALOG_EXTENSION_REQUIRED);

  const ping = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'ping',
  });
  if (
    ping?.capabilities?.coupangCatalogSnapshot !== true ||
    ping.capabilities.coupangCatalogSourceAttempts !== true ||
    !isVersionAtLeast(ping.version, COUPANG_CATALOG_EXTENSION_MIN_VERSION)
  ) {
    throw new Error(COUPANG_CATALOG_EXTENSION_RELOAD_REQUIRED);
  }
  await transferExtensionAuthTo(extensionId);
  const started = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'startCoupangCatalogImport',
    permit: input.permit,
  });
  if (started?.success === false) {
    throw new Error(started.error || '쿠팡 상품 수집을 시작하지 못했습니다.');
  }
  return extensionId;
}

export async function getCoupangCatalogBrowserStatus(
  extensionId: string,
  attemptId: string,
): Promise<CoupangCatalogBrowserStatus> {
  const status = CoupangCatalogBrowserStatusSchema.parse(await sendToExtension(extensionId, {
    action: 'getCoupangCatalogImportStatus',
    attemptId,
  }));
  if (status.attemptId !== attemptId) throw new Error('쿠팡 수집 시도 응답이 일치하지 않습니다.');
  return status;
}

function isVersionAtLeast(
  current: string | null | undefined,
  minimum: string,
): boolean {
  if (!current) return false;
  const currentParts = current.split('.').map((part) => Number(part) || 0);
  const minimumParts = minimum.split('.').map((part) => Number(part) || 0);
  const length = Math.max(currentParts.length, minimumParts.length);
  for (let index = 0; index < length; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }
  return true;
}
