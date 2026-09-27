import { findChannel } from '@kiditem/shared/channel-registry';
import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED } from '../../core/site-caller';
import { withFreshTab } from '../fresh-tab';
import { callPage } from '../page-call';
import type { SiteLease } from '../registry';
import { createSiteSignIn, type LoginDeps, type LoginSpec, type SiteSignIn } from '../site-login';
import type { PageGuard, TabPage, TabPages } from '../tab-page';
import type { Fetch } from './images';

/**
 * 몰 판매 상태 쓰기·읽기(KID-256 — 옛 `background/orders/mall-availability-send.js` 이식). 몰마다 다른 것(판매자센터 주소·
 * 요청 모양·다시 읽기)은 `sites/<mall>/availability.ts`가 몰 키로 등록하고, 여기는 공통 도구만 둔다: 판매자센터 탭 하나에서
 * 화면 안 요청을 하나씩 부르는 `withSellerPage`(옛 `withSellerPage` 대신 `withFreshTab({reuseTabMatching})` — 이미 열린
 * 로그인된 판매자센터 탭이 있으면 빌려 쓰고 건드리지 않는다), 몰 말 읽기, 멈춘 자리 셈. 기다림·재시도는 여기(서비스워커)에서
 * 한다 — 백그라운드 탭의 타이머는 오래 숨으면 분 단위로 늦어진다.
 *
 * 품절·재개는 되돌릴 수 있는 명령이라 끝까지 보낸다(사장님 2026-09-18). 보냈다(`sent`)와 몰에 반영됐다(다시 읽기)는 다른
 * 사실이다 — 증거는 다시 읽은 것만 싣는다.
 */

/** 몰이 준 응답 원문(모양은 몰이 정한다 — 읽는 곳마다 그 몰의 칸을 본다). */
// eslint 없음 — 외부 응답 JSON은 몰마다 모양이 달라 좁히지 않고 읽는 자리에서 칸을 본다.
export type MallJson = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 화면 안 요청 하나의 답(옛 `requestOnPage` 모양). */
export interface PageReply {
  status: number;
  json: MallJson;
  preview?: string;
  url?: string;
  [key: string]: MallJson;
}

/** 지금 상태 한 옵션(옛 read 결과 모양). 판매중이면 재고 모름(null), 못 사면 0과 몰의 상태 글자. */
export interface AvailabilityOption {
  optionCode: string;
  stock: number | null;
  rocket: boolean;
  state?: string;
}

export interface AvailabilityProduct {
  code: string;
  options: AvailabilityOption[];
}

export type AvailabilityReadAnswer =
  | { success: true; products: AvailabilityProduct[]; missing: string[] }
  | { success: false; error: string };

/** 보내기 결과(옛 `send` 결과 모양). `observed`: 다시 읽기가 따로 없는 몰(도매꾹)이 보낸 뒤 다시 읽은 상태. */
export interface AvailabilitySendAnswer {
  success: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  confirmed?: number;
  already?: number;
  rocket?: number;
  requestOnly?: boolean;
  warnings?: string[];
  stopped?: string;
  observed?: AvailabilityProduct[];
  /** 보내기 전에 몰 화면에서 대조한 판매자 식별자(윙 업체코드). 대조하지 않는 몰은 없다. */
  providerAccountId?: string | null;
  observedUrl?: string | null;
}

export interface PriceSendAnswer {
  success: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  confirmed?: number;
  warnings?: string[];
  /** 가격 반영을 다시 읽어 확인한 상품번호. */
  confirmedCodes?: string[];
}

export interface AvailabilityDeps extends LoginDeps {
  tabs: TabPages;
  fetch: Fetch;
}

/** 몰 하나의 쓰기 도구(서비스워커 쪽). */
export interface AvailabilityContext extends AvailabilityDeps {
  mallKey: string;
  displayName: string;
  guard: PageGuard;
  signIn: SiteSignIn | null;
  dialogHosts: readonly string[];
}

/** 판매자센터 탭 하나의 요청 도구. `world: 'main'`은 화면 전역을 쓰는 요청(롯데ON·스마트스토어). */
export type PageRun = (name: string, args: unknown[], world?: 'main') => Promise<PageReply>;

export interface MallAvailabilityModule {
  mallKey: string;
  displayName: string;
  guard: PageGuard;
  dialogHosts: readonly string[];
  login?: LoginSpec;
  send(context: AvailabilityContext, input: { codes: string[]; options: Record<string, string[]> | null; resume: boolean; expectedProviderAccountId: string | null }): Promise<AvailabilitySendAnswer>;
  read?(context: AvailabilityContext, codes: string[]): Promise<AvailabilityReadAnswer>;
  sendPrice?(context: AvailabilityContext, items: Array<{ code: string; price: number; ifPrice: number | null }>): Promise<PriceSendAnswer>;
}

export const AVAILABILITY_FILE = 'content/page-call/mall-availability.js';
export const AVAILABILITY_MAIN_FILE = 'content/page-call/mall-availability-main.js';
/** 요청 하나(몰 응답이 느린 조회 · 여러 쪽 읽기 포함). */
const CALL_TIMEOUT_MS = 3 * 60_000;

const modules = new Map<string, MallAvailabilityModule>();

export function registerMallAvailability(module: MallAvailabilityModule): void {
  if (modules.has(module.mallKey)) throw new Error(`duplicate mall availability: ${module.mallKey}`);
  modules.set(module.mallKey, module);
}

export function mallAvailabilityFor(mallKey: string): MallAvailabilityModule | null {
  return modules.get(mallKey) ?? null;
}

export function registeredMallAvailability(): MallAvailabilityModule[] {
  return [...modules.values()].sort((a, b) => (a.mallKey < b.mallKey ? -1 : a.mallKey > b.mallKey ? 1 : 0));
}

export function availabilityContext(module: MallAvailabilityModule, deps: AvailabilityDeps, lease: SiteLease): AvailabilityContext {
  return {
    ...deps,
    mallKey: module.mallKey,
    displayName: module.displayName,
    guard: module.guard,
    signIn: module.login ? createSiteSignIn(module.login, lease.credentials, deps) : null,
    dialogHosts: module.dialogHosts,
  };
}

/** 옵션 단위(윙) 몰인가 — 채널 레지스트리의 품절 단위. */
export function availabilityByOption(mallKey: string): boolean {
  return findChannel(mallKey)?.soldOutScope === 'option';
}

/**
 * 판매자센터 탭 하나에서 일한다. 이미 열린 그 몰 화면(로그인된 채 다 뜬 것)이 있으면 빌려 쓰고 건드리지 않는다. 없으면 뒤에서
 * 열고 끝나면 닫는다(로그인 화면이면 실행 자격으로 그 탭에서 한 번 로그인하고, 그래도 로그인 화면이면 탭을 운영자에게 남긴다).
 */
export async function withSellerPage<T>(
  context: AvailabilityContext,
  origin: string,
  pageUrl: string,
  work: (run: PageRun, page: TabPage) => Promise<T>,
): Promise<T> {
  return withFreshTab(context.tabs, pageUrl, async (page) => work(pageRun(context, page), page), {
    reuseTabMatching: `${origin}/*`,
    ...(context.signIn ? { signIn: context.signIn } : { dialogGuardHosts: context.dialogHosts }),
  });
}

function pageRun(context: AvailabilityContext, page: TabPage): PageRun {
  return async (name, args, world) => {
    try {
      const answer = await callPage<PageReply | null>(page, `availability.${name}`, args, {
        timeoutMs: CALL_TIMEOUT_MS,
        guard: context.guard,
        displayName: context.displayName,
        ...(world === 'main' ? { main: [AVAILABILITY_MAIN_FILE] } : { isolated: [AVAILABILITY_FILE] }),
      });
      return answer ?? { status: 0, json: null };
    } catch (error) {
      // 로그인 화면·사이트 밖으로 옮겨 간 탭은 그대로 올린다(탭을 운영자에게 남긴다). 그 밖은 답 없는 요청이다.
      if (error instanceof RuntimeError && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === 'unexpected_url')) throw error;
      return { status: 0, json: null, preview: error instanceof Error ? error.message.slice(0, 200) : '' };
    }
  };
}

/** 품절 여부만 주는 몰의 지금 상태 한 줄(옛 `flagOption`). 판매중이면 재고 모름(null), 아니면 0과 몰의 상태 글자. */
export function flagOption(code: string, selling: boolean, state?: string | null): AvailabilityOption {
  return selling ? { optionCode: code, stock: null, rocket: false } : { optionCode: code, stock: 0, rocket: false, ...(state ? { state: String(state) } : {}) };
}

/**
 * 보내는 도중 멈췄을 때(로그인이 풀림 등, 옛 `stoppedMidway`). 이미 몰에 간 것은 버리지 않는다 — 하나라도 새로 보냈으면 그
 * 건수와 멈춘 까닭을 돌려주고, 하나도 안 보냈으면 실패다.
 */
export function stoppedMidway(message: string, counts: { sent: number; failed: number; confirmed: number; already: number; warnings: string[]; left: number }): AvailabilitySendAnswer {
  const { sent, failed, confirmed, already, warnings, left } = counts;
  if (sent === 0) return { success: false, error: message };
  return {
    success: true,
    sent: sent + already,
    failed: failed + left,
    confirmed: confirmed + already,
    already,
    rocket: 0,
    requestOnly: false,
    warnings: [...warnings, `${message} ${left > 0 ? `— ${left}건은 보내지 못했습니다.` : ''}`.trim()],
    stopped: 'halted',
  };
}

/** 몰이 뭐라고 답했는지(옛 `readAnswer`). 본문은 남기지 않는다 — 길이와 신호만 본다. */
export function readAnswer(status: number, text: string): { status: number; accepted: boolean; failed: boolean; loggedOut?: boolean } {
  const failed = /로그인|login|오류|실패|error|권한/i.test(String(text || '').slice(0, 500));
  return { status, accepted: status >= 200 && status < 400 && !failed, failed };
}

/** 몰이 JSON으로 답하면 읽는다(옛 `readJson`). 아니면 null. */
export async function readJson(response: Response): Promise<{ json: MallJson; text: string }> {
  const text = await response.text().catch(() => '');
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/** 서비스워커에서 판매자센터에 폼 하나를 보낸다(옛 `postForm`). 로그인 화면으로 넘어갔으면 받은 것이 아니다. */
export async function postForm(fetchApi: Fetch, origin: string, action: string, pairs: Array<[string, string]>, encoding?: string) {
  const params = new URLSearchParams();
  for (const [name, value] of pairs) params.append(name, value);
  const response = await fetchApi(`${origin}${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': `application/x-www-form-urlencoded${encoding ? `; charset=${encoding}` : ''}` },
    body: params.toString(),
  });
  const landed = String(response.url || '');
  if (landed && (!landed.startsWith(origin) || /login/i.test(landed))) {
    return { status: response.status, accepted: false, failed: true, loggedOut: true };
  }
  return readAnswer(response.status, await response.text().catch(() => ''));
}

/** 가격 보내기: 한 번에 보낼 상품 수와 받아들이는 가격(원). 오타로 0원 · 억 단위가 나가지 않게 막는다. */
export const PRICE_BATCH = 50;
export const PRICE_MIN = 10;
export const PRICE_MAX = 10_000_000;
/** 지금 재고 읽기 한 번에 읽는 상품 수(옛 `READ_LIMIT` — 등록현황 한 페이지가 들어간다). */
export const READ_LIMIT = 50;

function failureOf(error: unknown): { success: false; error: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

/** 로그인 화면에서 멈춘 탭(운영자에게 남긴다)은 실행을 그 코드로 끝내야 한다 — 몰 답으로 접지 않는다. */
function rethrowIfLeftForOperator(error: unknown): void {
  if (error instanceof RuntimeError && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === 'unexpected_url')) throw error;
}

/**
 * 품절·재개를 보낸다(옛 `send(msg)`의 입력 정리). 상품코드는 겹침·빈칸을 뺀다. 옵션 단위 몰(윙)은 `options`(상품코드 →
 * 옵션코드)로 짚은 옵션만 바꾼다.
 */
export async function sendMallAvailability(
  module: MallAvailabilityModule,
  context: AvailabilityContext,
  input: { codes: readonly string[]; options?: Record<string, string[]> | null; resume: boolean; expectedProviderAccountId?: string | null },
): Promise<AvailabilitySendAnswer> {
  const codes = [...new Set(input.codes.map((code) => String(code || '').trim()).filter(Boolean))];
  if (codes.length === 0) return { success: false, error: '품절로 보낼 상품코드가 없습니다.' };
  try {
    return await module.send(context, { codes, options: input.options ?? null, resume: input.resume, expectedProviderAccountId: input.expectedProviderAccountId ?? null });
  } catch (error) {
    rethrowIfLeftForOperator(error);
    return failureOf(error);
  }
}

/** 지금 상태를 읽는다(옛 `read(msg)`). 읽기만 한다. */
export async function readMallAvailability(module: MallAvailabilityModule, context: AvailabilityContext, codes: readonly string[]): Promise<AvailabilityReadAnswer> {
  if (!module.read) return { success: false, error: `지금 재고를 읽을 수 있는 몰이 아닙니다: ${module.mallKey}` };
  try {
    return await module.read(context, codes.map((code) => String(code || '').trim()).filter(Boolean));
  } catch (error) {
    rethrowIfLeftForOperator(error);
    return failureOf(error);
  }
}

/** 가격을 보낸다(옛 `sendPrice(msg)`의 입력 검사 — 0원 · 억 단위 같은 값은 아무것도 보내지 않고 거절한다). */
export async function sendMallPrice(
  module: MallAvailabilityModule,
  context: AvailabilityContext,
  raw: ReadonlyArray<{ code: string; price: number; ifPrice?: number | null }>,
): Promise<PriceSendAnswer> {
  if (!module.sendPrice) return { success: false, error: `가격 경로를 아는 몰이 아닙니다: ${module.mallKey}` };
  const seen = new Set<string>();
  const items: Array<{ code: string; price: number; ifPrice: number | null }> = [];
  for (const item of raw) {
    const code = String(item?.code || '').trim();
    const price = Number(item?.price);
    const ifPrice = item?.ifPrice === null || item?.ifPrice === undefined ? null : Number(item.ifPrice);
    if (!code || seen.has(code)) continue;
    if (!Number.isInteger(price) || price < PRICE_MIN || price > PRICE_MAX) {
      return { success: false, error: `${code}: 가격은 ${PRICE_MIN}원 ~ ${PRICE_MAX.toLocaleString('ko-KR')}원 사이 정수여야 합니다.` };
    }
    if (ifPrice !== null && !Number.isInteger(ifPrice)) return { success: false, error: `${code}: 지금 몰 가격 값이 올바르지 않습니다.` };
    seen.add(code);
    items.push({ code, price, ifPrice });
  }
  if (items.length === 0) return { success: false, error: '가격을 보낼 상품이 없습니다.' };
  if (items.length > PRICE_BATCH) return { success: false, error: `가격은 한 번에 ${PRICE_BATCH}개까지 보냅니다.` };
  try {
    return await module.sendPrice(context, items);
  } catch (error) {
    rethrowIfLeftForOperator(error);
    return failureOf(error);
  }
}

export const MALL_WRITE_FAILED = 'MALL_WRITE_FAILED' as const;

/** 몰 답(`success: false`)을 실행 오류로. 로그인이 풀렸다는 답은 운영자가 로그인할 일이다. */
function answerError(module: MallAvailabilityModule, error: string | undefined): RuntimeError {
  const message = error || `${module.displayName}에 판매 상태를 보내지 못했습니다.`;
  return /로그인/.test(message)
    ? new RuntimeError(SITE_LOGIN_REQUIRED, message, { mallKey: module.mallKey })
    : new RuntimeError(MALL_WRITE_FAILED, message, { mallKey: module.mallKey });
}

export interface AvailabilityRunInput {
  resume: boolean;
  byOption: boolean;
  listings: ReadonlyArray<{ externalListingId: string; externalOptionIds: readonly string[] }>;
  expectedProviderAccountId: string | null;
}

export interface AvailabilityObserved {
  externalListingId: string;
  status: string | null;
  options: Array<{ externalOptionId: string; stock: number | null; status: string | null }>;
}

function observedOf(product: AvailabilityProduct): AvailabilityObserved {
  return {
    externalListingId: product.code,
    status: product.options.find((option) => option.state)?.state ?? null,
    options: product.options.map((option) => ({ externalOptionId: option.optionCode, stock: option.stock, status: option.state ?? null })),
  };
}

/**
 * 품절·재개 실행 하나(`channels.registration` sold_out·resume): 보낸 뒤 몰을 다시 읽어 리스팅마다 지금 상태를 돌려준다 — 증거는
 * 다시 읽은 것만이다. 보내기가 스스로 다시 읽은 몰은 그 값을 쓰고, 나머지는 읽기(한 번에 `READ_LIMIT`개)로 읽는다. 다시 읽지
 * 못하면 비워 둔다(수집기가 확인하지 못한 것으로 끝낸다). 몰이 거절한 답·로그인은 던진다.
 */
export async function runAvailability(module: MallAvailabilityModule, context: AvailabilityContext, input: AvailabilityRunInput) {
  const codes = input.listings.map((listing) => listing.externalListingId);
  const options = input.byOption ? Object.fromEntries(input.listings.map((listing) => [listing.externalListingId, [...listing.externalOptionIds]])) : null;
  const answer = await sendMallAvailability(module, context, { codes, options, resume: input.resume, expectedProviderAccountId: input.expectedProviderAccountId });
  if (!answer.success) throw answerError(module, answer.error);
  let products = answer.observed ?? null;
  if (!products && module.read && !answer.requestOnly) {
    products = [];
    for (let start = 0; start < codes.length; start += READ_LIMIT) {
      const read = await readMallAvailability(module, context, codes.slice(start, start + READ_LIMIT));
      if (!read.success) {
        answer.warnings = [...(answer.warnings ?? []), `${module.displayName}에서 바뀐 상태를 다시 읽지 못했습니다: ${read.error}`];
        break;
      }
      products.push(...read.products);
    }
  }
  return {
    answer,
    observed: (products ?? []).map(observedOf),
    providerAccountId: answer.providerAccountId ?? null,
    observedUrl: answer.observedUrl ?? null,
  };
}

/** 판매 상태 읽기 실행(`channels.mall_availability_read`)의 한 묶음. 몰이 거절한 답·로그인은 던진다. */
export async function readAvailabilityOrThrow(module: MallAvailabilityModule, context: AvailabilityContext, codes: readonly string[]) {
  const read = await readMallAvailability(module, context, codes);
  if (!read.success) throw answerError(module, read.error);
  return { products: read.products, missing: read.missing };
}
