import { WING_LOGIN } from '../wing/login';
import type { LoginSpec } from '../site-login';
import { hostWithin } from '../tab-page';

/**
 * 쿠팡 광고센터 로그인 입구(KID-371). 로그아웃 상태로 `/marketing`에 들어가면 광고센터 `/user/login`(계정 유형 선택 →
 * 아이디·비밀번호)이나 판매자 로그인(`xauth.coupang.com`, Wing과 같은 Keycloak)으로 넘어간다 — 두 주소 모두 manifest
 * 권한에 있다. 옛 광고 수집(`ads-report.js` `attemptAdvertisingLoginAutoSubmit`, `ad-center-collector.js`
 * `externalLoginUrl`)이 본 로그인 화면이 이 둘이다.
 *
 * 폼 칸은 Wing 로그인(`../wing/login`)과 같은 아이디·비밀번호 둘이고, 채우기는 공용 `login-fill.js`가 비밀번호 칸이 있는
 * 폼을 찾아 한다. 계정 유형 선택 화면(비밀번호 칸 없음, "쿠팡 wing 로그인하기" 버튼)은 누르지 않는다 — 폼이 보이지 않은 채
 * 시간이 다 되면 `login_unconfirmed`로 멈추고 탭을 운영자에게 남긴다.
 */
export const AD_CENTER_LOGIN: LoginSpec = {
  displayName: '쿠팡 광고센터',
  loginUrl: 'https://advertising.coupang.com/marketing',
  hosts: ['advertising.coupang.com', 'xauth.coupang.com'],
  isLoginUrl: (url) => hostWithin(url, ['xauth.coupang.com'])
    || (url.hostname.toLowerCase() === 'advertising.coupang.com' && /^\/user\/login\/?$/.test(url.pathname)),
  fields: WING_LOGIN.fields,
};
