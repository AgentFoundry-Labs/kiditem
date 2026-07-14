import type { CoupangCatalogBrowserStatus } from '@kiditem/shared/coupang-catalog-snapshot';
import {
  detectExtensionId,
  isChromeExtensionRuntimeAvailable,
  sendToExtension,
} from '@/lib/extension-bridge';

type ExtensionResponse = {
  success?: boolean;
  started?: boolean;
  error?: string;
  capabilities?: Record<string, unknown>;
};

export const COUPANG_CATALOG_EXTENSION_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램을 설치하고 새로고침한 뒤 다시 시도하세요.';
export const COUPANG_CATALOG_EXTENSION_RELOAD_REQUIRED =
  'KIDITEM 쿠팡 확장프로그램이 이전 버전입니다. chrome://extensions에서 새로고침한 뒤 다시 시도하세요.';

export async function startCoupangCatalogBrowser(input: {
  channelAccountId: string;
  runId: string;
  accessToken: string | null | undefined;
}): Promise<string> {
  if (!isChromeExtensionRuntimeAvailable()) {
    throw new Error('쿠팡 상품 수집은 Chrome에서 실행해주세요.');
  }
  if (!input.accessToken) throw new Error('로그인 세션을 확인할 수 없습니다.');
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error(COUPANG_CATALOG_EXTENSION_REQUIRED);

  const ping = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'ping',
  });
  if (ping?.capabilities?.coupangCatalogSnapshot !== true) {
    throw new Error(COUPANG_CATALOG_EXTENSION_RELOAD_REQUIRED);
  }
  const auth = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'setAuthToken',
    token: input.accessToken,
  });
  if (auth?.success === false) {
    throw new Error(auth.error || '확장프로그램 로그인 연동에 실패했습니다.');
  }
  const started = await sendToExtension<ExtensionResponse>(extensionId, {
    action: 'startCoupangCatalogImport',
    channelAccountId: input.channelAccountId,
    runId: input.runId,
  });
  if (started?.success === false) {
    throw new Error(started.error || '쿠팡 상품 수집을 시작하지 못했습니다.');
  }
  return extensionId;
}

export function getCoupangCatalogBrowserStatus(
  extensionId: string,
  runId: string,
): Promise<CoupangCatalogBrowserStatus> {
  return sendToExtension<CoupangCatalogBrowserStatus>(extensionId, {
    action: 'getCoupangCatalogImportStatus',
    runId,
  });
}

export function cancelCoupangCatalogBrowser(
  extensionId: string,
  runId: string,
): Promise<ExtensionResponse> {
  return sendToExtension<ExtensionResponse>(extensionId, {
    action: 'cancelCoupangCatalogImport',
    runId,
  });
}
