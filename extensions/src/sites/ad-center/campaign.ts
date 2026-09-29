import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { hostWithin, type PageGuard, type TabPage } from '../tab-page';
import { AD_CENTER_LOGIN } from './login';

/**
 * 광고센터 캠페인 등록 쓰기(KID-386 `advertising.ad_action`) — 옛 `content/coupang/ads-report.js` 캠페인 등록 실행의 DOM
 * 단계를 페이지 처리기 `content/page-call/ad-center-campaign-register.js`(ISOLATED)로 옮겼다. 규칙 하나: **누르기 전 실패는
 * 던지고, [완료]를 눌렀거나 눌렀을 수 있으면 던지지 않고 증거를 돌려준다** — 수집기가 앞은 `not_attempted`(실패 finish),
 * 뒤는 `created`/`uncertain`(성공 finish)으로 나눈다. 캠페인이 두 번 생기지 않게 누르는 호출의 답이 끊겨도 눌렀다고 본다.
 */
export const AD_CENTER_CAMPAIGN_FILE = 'content/page-call/ad-center-campaign-register.js';
export const AD_CENTER_CAMPAIGN_TYPE_URL = 'https://advertising.coupang.com/marketing/campaign/type';
/** 등록 폼 요소를 못 찾음(사이트 계약 변경) — 확장이 finish에 싣는 코드. registry 등록은 서버 트랙(KID-386 A). */
export const ADVERTISING_AD_CENTER_FORM_CHANGED = 'ADVERTISING_AD_CENTER_FORM_CHANGED' as const;

const NAVIGATION_TIMEOUT_MS = 30_000;
/** 상품 50개까지 검색·선택(상품마다 최대 8초 대기) — 실행 임대 10분 안에 끝나도록 6분에 끊는다. */
const FILL_TIMEOUT_MS = 6 * 60_000;
const SUBMIT_TIMEOUT_MS = 30_000;
const RESULT_TIMEOUT_MS = 30_000;

const GUARD: PageGuard = {
  allows: (url) => hostWithin(url, AD_CENTER_LOGIN.hosts),
  isLogin: (url) => AD_CENTER_LOGIN.isLoginUrl(url),
  loginMessage: `${AD_CENTER_LOGIN.displayName} 로그인이 필요합니다.`,
};

export interface AdCenterCampaignInput {
  name: string;
  adGroupName?: string;
  productIds: string[];
  dailyBudget: number;
  targetRoas: number | null;
}

/** [완료]를 누른 뒤 화면이 보인 것. 번호를 못 읽었으면 `campaignId` null. */
export interface AdCenterCampaignSubmission {
  campaignId: string | null;
  message: string | null;
  url: string | null;
}

export async function submitCampaign(page: TabPage, input: AdCenterCampaignInput, options: { signal?: AbortSignal } = {}): Promise<AdCenterCampaignSubmission> {
  const landed = await page.navigate(AD_CENTER_CAMPAIGN_TYPE_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS, continueOnTimeout: true, stopAt: isLoginUrl });
  if (isLoginUrl(landed)) throw new RuntimeError(SITE_LOGIN_REQUIRED, GUARD.loginMessage, { reason: 'login_unconfirmed' });

  const call = <T>(name: string, args: unknown, timeoutMs: number) =>
    callPage<T>(page, name, args, { timeoutMs, guard: GUARD, displayName: AD_CENTER_LOGIN.displayName, isolated: [AD_CENTER_CAMPAIGN_FILE] });

  const filled = await call<FillAnswer>('adCenter.campaignFill', input, FILL_TIMEOUT_MS);
  if (filled?.state === 'product_not_found') {
    const missing = Array.isArray(filled.productIds) ? filled.productIds.map(String) : [];
    throw new RuntimeError(SITE_REQUEST_FAILED, `쿠팡 광고센터에서 광고할 상품을 찾지 못했습니다: ${missing.join(', ')}`, {
      reason: 'product_not_found',
      productIds: missing,
    });
  }
  if (filled?.state !== 'filled') throw formChanged(filled);
  options.signal?.throwIfAborted();

  // 여기서부터는 눌렀을 수 있다 — 답이 끊겨도(화면 이동) 던지지 않는다.
  let submitted: SubmitAnswer | null = null;
  try {
    submitted = await call<SubmitAnswer>('adCenter.campaignSubmit', {}, SUBMIT_TIMEOUT_MS);
  } catch {
    submitted = null;
  }
  if (submitted?.state === 'form_changed') throw formChanged(submitted);

  const result = await call<ResultAnswer>('adCenter.campaignResult', {}, RESULT_TIMEOUT_MS).catch(() => null);
  const campaignId = typeof result?.campaignId === 'string' && /^\d+$/.test(result.campaignId) ? result.campaignId : null;
  const message = text(result?.validation) ?? text(result?.message)
    ?? (result ? null : '완료를 누른 뒤 광고센터 화면을 읽지 못했습니다.');
  return { campaignId, message, url: text(result?.url) };
}

interface FillAnswer {
  state?: string;
  missing?: string;
  productIds?: unknown[];
}
interface SubmitAnswer {
  state?: string;
  missing?: string;
  confirmed?: boolean;
}
interface ResultAnswer {
  url?: unknown;
  campaignId?: unknown;
  message?: unknown;
  validation?: unknown;
}

function formChanged(answer: { state?: string; missing?: string } | null | undefined): RuntimeError {
  const missing = typeof answer?.missing === 'string' ? answer.missing : null;
  return new RuntimeError(
    ADVERTISING_AD_CENTER_FORM_CHANGED,
    `쿠팡 광고센터 캠페인 등록 화면이 바뀌어 채우지 못했습니다${missing ? `: ${missing}` : ''}. 개발자에게 알려 주세요.`,
    { missing, state: answer?.state ?? null },
  );
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null;
}

function isLoginUrl(value: string): boolean {
  try {
    return AD_CENTER_LOGIN.isLoginUrl(new URL(value));
  } catch {
    return false;
  }
}
