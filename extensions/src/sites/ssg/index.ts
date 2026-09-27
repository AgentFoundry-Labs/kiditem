import type { LoginSpec } from '../site-login';
import { hostWithin, type PageGuard } from '../tab-page';

/** 신세계 파트너오피스 첫 화면(옛 `mall-session.js` ssg 줄). 로그아웃이면 `authentication/login.ssg`로 넘어간다(2026-09-16 실측). */
export const SSG_ENTRY_URL = 'https://po.ssgadm.com/';
const HOSTS = ['po.ssgadm.com'];
const isSsgLogin = (url: URL) => hostWithin(url, HOSTS) && /authentication\/login|\/login(?:[/?#.]|$)/i.test(url.pathname);

export const SSG_PAGE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, HOSTS),
  isLogin: isSsgLogin,
  loginMessage: '신세계 파트너오피스 로그인이 필요합니다. 열린 신세계 화면에서 로그인한 뒤 다시 시도해 주세요.',
};

/**
 * 신세계 로그인 입구(옛 `mall-session.js` ssg 줄 → KID-256). 아이디·비밀번호 폼이다. 로그인 주소가 따로 없어 첫 화면으로
 * 들어가면 로그아웃일 때 로그인 화면으로 넘어간다.
 */
export const SSG_LOGIN: LoginSpec = {
  displayName: '신세계',
  loginUrl: SSG_ENTRY_URL,
  hosts: HOSTS,
  isLoginUrl: isSsgLogin,
  fields: ['loginId', 'password'],
};
