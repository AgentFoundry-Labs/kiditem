import { toast } from 'sonner';
import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

/** 확장 응답이 '쿠팡 supplier 로그인 필요'(pendingLogin)를 나타내는 에러인지. */
export function isCoupangLoginNeeded(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { pendingLogin?: unknown }).pendingLogin === true);
}

/**
 * 쿠팡 supplier 로그인 탭을 앞으로 가져온다.
 * ⭐자동 로그인/비번 저장은 하지 않는다(쿠팡 봇탐지·캡차·본계정 잠김 위험). 사용자가 직접 로그인하면
 * 세션 쿠키가 유지돼 이후 수집은 그 세션을 재사용한다.
 */
export async function openCoupangLogin(): Promise<void> {
  const id =
    (await detectOrderCollectionExtensionId(1200, 'openCoupangLogin')) ||
    (await detectOrderCollectionExtensionId());
  if (!id) {
    toast.error('주문수집 확장을 찾지 못했습니다. Chrome 확장 관리에서 새로고침해주세요.');
    return;
  }
  await sendToExtension(id, { action: 'openCoupangLogin' }, 15000);
}

/**
 * 수집 실패 처리: 쿠팡 로그인 필요면 [쿠팡 로그인창 열기] 버튼이 달린 토스트, 그 외엔 일반 에러 토스트.
 * (수집 api 는 pendingLogin 플래그를 에러에 붙여서 던진다.)
 */
export function notifyCollectError(err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : String(err ?? fallback);
  if (isCoupangLoginNeeded(err)) {
    toast.error(message, {
      duration: 12000,
      action: { label: '쿠팡 로그인창 열기', onClick: () => void openCoupangLogin() },
    });
    return;
  }
  toast.error(message || fallback);
}
