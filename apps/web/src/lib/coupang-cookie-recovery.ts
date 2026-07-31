import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

/**
 * supplier.coupang.com 은 쿠키가 누적되면 요청 헤더가 서버 상한을 넘어 HTTP 400 을 돌려준다.
 * 재시도로는 풀리지 않고 쿠키를 비워야 복구되므로, 400 을 만난 화면이 이 복구를 제공한다.
 * 쉽먼트와 로켓 두 화면이 함께 쓰기 때문에 공용으로 둔다.
 */
export const COUPANG_COOKIE_BLOAT_CODE = 'coupang_cookie_bloat';

/** 확장이 돌려준 오류가 쿠키 과다(400)인지. 확장은 코드 대신 문구만 주는 경로도 있어 둘 다 본다. */
export function isCoupangCookieBloatMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /쿠키가 커져|HTTP 400|쿠키를 정리/.test(message);
}

interface ClearCookiesResponse {
  success?: boolean;
  cleared?: number;
  total?: number;
  error?: string;
}

/**
 * ⚠️ 파괴적: supplier.coupang.com 에 적용되는 쿠키를 지운다. `.coupang.com` 공용 쿠키까지 걸려
 * WING·로켓 등 모든 쿠팡 포털에서 로그아웃된다. 반드시 화면에서 사용자 확인을 받은 뒤 호출한다.
 * 쿠키 값은 확장에서도 읽거나 반환하지 않으며, 정리한 개수만 돌려받는다.
 */
export async function clearCoupangCookiesViaExtension(): Promise<number> {
  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '주문수집 확장프로그램이 필요합니다. Chrome에서 extensions/kiditem-os를 로드한 뒤 다시 시도해주세요.',
    );
  }
  const response = await sendToExtension<ClearCookiesResponse>(
    extensionId,
    { action: 'clearCoupangCookies' },
    30000,
  );
  if (!response?.success) {
    throw new Error(response?.error ?? '쿠팡 쿠키 정리에 실패했습니다.');
  }
  return response.cleared ?? 0;
}
