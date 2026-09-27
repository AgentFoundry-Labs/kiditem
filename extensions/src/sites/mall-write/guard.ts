import type { PageGuard } from '../tab-page';

/**
 * 몰 쓰기 탭의 주소 규칙(KID-256). 그 몰 사이트의 호스트 규칙을 그대로 쓰고, 로그인 화면에서 멈출 때의 문장만 등록 말로
 * 바꾼다. 몰 주문 읽기 규칙이 등록 화면을 로그인으로 보는 몰(아트공구 — 주문목록 밖 Cafe24 화면은 다 로그인)은 로그인 화면
 * 규칙을 따로 준다.
 */
export function registrationGuard(site: PageGuard, displayName: string, isLogin?: (url: URL) => boolean): PageGuard {
  return {
    allows: site.allows,
    isLogin: isLogin ?? site.isLogin,
    loginMessage: `${displayName} 로그인이 필요합니다. 열린 ${displayName} 화면에서 로그인한 뒤 다시 등록해 주세요.`,
  };
}
