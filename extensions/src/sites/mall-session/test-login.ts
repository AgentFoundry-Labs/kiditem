import { ART09_LOGIN } from '../art09';
import { BORIBORI_LOGIN } from '../boribori';
import { COUPANG_SUPPLIER_LOGIN } from '../coupang-supplier/page';
import { DOMEGGOOK_LOGIN } from '../domeggook';
import { GS_SHOP_LOGIN } from '../gs-shop';
import { HAEBUB_MALL_LOGIN } from '../haebub-mall';
import { ICECREAM_LOGIN } from '../icecream-mall';
import { KIDKIDS_LOGIN } from '../kidkids';
import { KIDSNOTE_LOGIN } from '../kidsnote';
import { KKOMANGSE_LOGIN } from '../kkomangse';
import { LOTTE_ON_LOGIN } from '../lotte-on';
import { ONCH_LOGIN } from '../onch';
import type { SiteCredentials } from '../registry';
import { ensureLoggedIn, type LoginDeps, type LoginOutcome, type LoginSpec } from '../site-login';
import { SSG_LOGIN } from '../ssg';
import type { TabPage, TabPages } from '../tab-page';
import { TEACHER_MALL_LOGIN } from '../teacher-mall';
import { WING_LOGIN } from '../wing/login';

/**
 * 쇼핑몰 계정 화면의 로그인 테스트(KID-366 `testMallLogin`). 옛 `mall-session.js` `ensureLoggedIn` 대신 새 런타임의 사이트 로그인
 * (`site-login.ts`)을 쓴다: 확인용 백그라운드 탭(알림 창 가드)에서 그 몰의 로그인 입구에 저장 자격을 채워 누르고, 폼이 사라졌는지까지
 * 본다. 실행이 아니다 — 서버로는 아무것도 보내지 않는다. 자격은 이 호출 동안 메모리에만 있고 응답·로그·오류 details에 싣지 않는다.
 *
 * 판정 → `errorCode`(registry, 계약 `TestMallLoginResponseSchema`): 로그인됨 null · 이미 로그인돼 폼이 없음 null(`verified: true`,
 * `submitted: false`) · 거절·폼 잔존 `MALL_LOGIN_REJECTED`(몰의 말은 `mallMessage`, 막을지는 웹이 정한다) · 본인확인
 * `SITE_VERIFICATION_REQUIRED` · 결과 미확인 `MALL_LOGIN_UNCONFIRMED` · 탭을 열지 못함 `MALL_LOGIN_PAGE_UNREACHABLE` · 폼 없는 몰·입구
 * 없는 몰 `MALL_LOGIN_UNSUPPORTED`. 탭은 결과가 나왔으면 닫고, 운영자가 봐야 하면(본인확인·미확인) 앞으로 가져온다.
 */
const LOGIN_SPECS: Readonly<Record<string, LoginSpec>> = {
  onch: ONCH_LOGIN,
  kidsnote: KIDSNOTE_LOGIN,
  kidkids: KIDKIDS_LOGIN,
  'icecream-mall': ICECREAM_LOGIN,
  art09: ART09_LOGIN,
  'haebub-mall': HAEBUB_MALL_LOGIN,
  'teacher-mall': TEACHER_MALL_LOGIN,
  boribori: BORIBORI_LOGIN,
  'lotte-on': LOTTE_ON_LOGIN,
  'gs-shop': GS_SHOP_LOGIN,
  ssg: SSG_LOGIN,
  kkomangse: KKOMANGSE_LOGIN,
  domeggook: DOMEGGOOK_LOGIN,
  // 쿠팡 직배송은 로켓 계정 행에 저장된 아이디·비밀번호로 서플라이어 허브에 로그인한다(ADR-0012).
  'coupang-direct': COUPANG_SUPPLIER_LOGIN,
  coupang: WING_LOGIN,
};
/** 채울 로그인 폼이 없는 몰(카카오 토큰·올웨이즈 브라우저 저장소 JWT). */
const NO_FORM_MALLS = new Set(['kakao', 'always']);
const LOGIN_SCREEN_URL = /\/(?:login|signin|sign-in|signIn)(?:[/?#.]|$)|loginform|partnerlogin|partner_login|login_so|authentication\/login/i;

/** 몰 키의 로그인 입구. 고정 입구가 없는 몰은 운영자가 저장한 사이트 주소(http·https)로 들어간다. */
export function loginSpecFor(mallKey: string, siteUrl?: string): LoginSpec | null {
  if (NO_FORM_MALLS.has(mallKey)) return null;
  if (Object.prototype.hasOwnProperty.call(LOGIN_SPECS, mallKey)) return LOGIN_SPECS[mallKey]!;
  let url: URL;
  try {
    url = new URL(siteUrl ?? '');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return {
    displayName: url.hostname,
    loginUrl: url.toString(),
    hosts: [url.hostname],
    isLoginUrl: (candidate) => LOGIN_SCREEN_URL.test(candidate.href),
    fields: ['loginId', 'password'],
  };
}

export interface MallLoginTestResult {
  submitted: boolean;
  verified: boolean;
  mallMessage: string | null;
  errorCode: string | null;
}

export async function testMallLogin(
  deps: LoginDeps & { tabs: TabPages },
  mallKey: string,
  credentials: SiteCredentials,
  siteUrl?: string,
): Promise<MallLoginTestResult> {
  const spec = loginSpecFor(mallKey, siteUrl);
  if (!spec) return { submitted: false, verified: false, mallMessage: null, errorCode: 'MALL_LOGIN_UNSUPPORTED' };
  const release = await deps.tabs.guardDialogs(spec.hosts);
  let page: TabPage | null = null;
  let outcome: LoginOutcome = { status: 'unconfirmed' };
  try {
    try {
      page = await deps.tabs.open('about:blank');
    } catch {
      return { submitted: false, verified: false, mallMessage: null, errorCode: 'MALL_LOGIN_PAGE_UNREACHABLE' };
    }
    outcome = await ensureLoggedIn(page, spec, credentials, deps).catch((): LoginOutcome => ({ status: 'unconfirmed' }));
    return resultOf(outcome);
  } finally {
    if (page) {
      if (outcome.status === 'verification_required' || outcome.status === 'unconfirmed') await page.focus().catch(() => undefined);
      else await page.close();
    }
    await release();
  }
}

function resultOf(outcome: LoginOutcome): MallLoginTestResult {
  const mallMessage = outcome.mallMessage ?? null;
  switch (outcome.status) {
    case 'ok':
      return { submitted: true, verified: true, mallMessage, errorCode: null };
    case 'no_form':
      // 로그인 입구에 폼이 없다 — 이미 로그인된 세션이다(저장 비밀번호를 검증한 것은 아니다).
      return { submitted: false, verified: true, mallMessage, errorCode: null };
    case 'rejected':
    case 'form_remains':
      return { submitted: true, verified: false, mallMessage, errorCode: 'MALL_LOGIN_REJECTED' };
    case 'verification_required':
      return { submitted: false, verified: false, mallMessage, errorCode: 'SITE_VERIFICATION_REQUIRED' };
    case 'unconfirmed':
      return { submitted: false, verified: false, mallMessage, errorCode: 'MALL_LOGIN_UNCONFIRMED' };
  }
}
