import { RuntimeError } from '../../core/errors';
import { RUNTIME_PLAN_INVALID } from '../mall-write/form';
import { REGISTRATION_FILL_FAILED } from '../mall-write/form-register';
import { toDataUrls } from '../mall-write/images';
import { asRaw } from '../mall-write/raw';
import { registerMallWriter, type MallFill, type MallFillInput, type MallSubmission, type MallWriteContext } from '../mall-write/writer';
import { callPage } from '../page-call';
import { hostWithin, type PageGuard, type TabPage } from '../tab-page';
import { WING_LOGIN } from './login';

/**
 * 쿠팡 WING 상품등록(formV2) 쓰기 모듈(KID-256 — 옛 `registerToWingForm`·`content/coupang/wing-registration-fill.js` 이식).
 * Wing은 몰 하나다(몰 키 `coupang`, 특례 경로 없음). 몰 17곳과 다른 것은 셋뿐이다:
 *  1. [상품등록] 누르기가 검증된 유일한 명세다 — 관문(ADR-0019)이 누르라고 할 때만 `wing.submit`을 부른다.
 *  2. formV2 번들이 문서가 뜨기 전에 보완을 받아야 옵션 화면이 그려진다(`wing-form-compat.js`를 새 문서 스크립트로).
 *  3. 채우기 전에 몰 화면의 판매자 업체코드를 plan의 계정과 대조한다(다르면 아무것도 넣지 않는다).
 * `payload.form`은 서버 plan이 얼린 최종 WingProduct다(웹 빌더 + 서버 Wing 채널 어댑터 덮기) — 확장은 덮지 않는다.
 */
export const WING_FORM_URL = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';
export const WING_REGISTER_FILE = 'content/page-call/wing-register.js';
export const WING_COMPAT_FILE = 'content/page-call/wing-form-compat.js';
export const WING_IDENTITY_FILE = 'shared/wing-account-identity.js';
/** formV2 준비(60초) + 옵션 생성 + 사진 업로드까지. */
const FILL_TIMEOUT_MS = 5 * 60_000;
/** [상품등록] → 확인 모달 → 완료 안내(최대 20초)까지. */
const SUBMIT_TIMEOUT_MS = 90_000;
const COMPAT_TIMEOUT_MS = 15_000;
const VENDOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
/** 서비스워커가 읽어 넘길 우리 저장소 사진(화면에서는 CORS·CSP로 막힐 수 있다). */
const STORAGE_ORIGINS = ['http://localhost:9000', 'http://kiditem-office:9000'];

export const WING_WRITE_GUARD: PageGuard = {
  allows: (url) => hostWithin(url, ['wing.coupang.com']),
  isLogin: (url) => WING_LOGIN.isLoginUrl(url),
  loginMessage: '쿠팡 윙 로그인이 필요합니다. 열린 쿠팡 윙 화면에서 로그인한 뒤 다시 등록해 주세요.',
};

type WingFillAnswer = { ok?: boolean; steps?: string[]; error?: string; evidence?: { wingVendorId?: string } };
type WingSubmitAnswer = { clicked?: boolean; ok?: boolean; status?: string; externalListingId?: string | null; error?: string; steps?: string[] };

/** WingProduct가 가리키는 우리 저장소 사진 주소들. */
function storageImageUrls(product: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    try {
      if (STORAGE_ORIGINS.includes(new URL(value).origin)) urls.add(value);
    } catch {
      // 주소가 아니면 넘긴다.
    }
  };
  for (const key of ['additionalImageUrls', 'detailImageUrls']) for (const url of Array.isArray(product[key]) ? product[key] as unknown[] : []) add(url);
  for (const variant of Array.isArray(product.variants) ? product.variants : []) add(asRaw(variant).representativeImageUrl);
  return [...urls];
}

/**
 * 채울 화면: 새 등록은 formV2, 수정(update·composition_change)은 그 리스팅의 수정 화면(`formV2?vendorInventoryId=`, 등록 완료
 * 화면이 같은 주소 규칙을 쓴다 — `wing-register.js` `extractRegisteredProductId`). 새 상품 등록 폼으로 구성을 바꾸지 않는다.
 */
function wingFormUrl(input: MallFillInput): string {
  if (input.executionKind === 'register') return WING_FORM_URL;
  const id = input.externalListingId?.trim() ?? '';
  if (!/^\d{6,}$/.test(id)) {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, '수정할 쿠팡 윙 등록상품ID가 없어 수정 화면을 열지 못했습니다.', { mallKey: 'coupang', executionKind: input.executionKind });
  }
  return `${WING_FORM_URL}?vendorInventoryId=${id}`;
}

/** WingProduct는 평평한 모양이다(최상위 `categoryCell`·`variants`). 옛 웹이 싣던 `{ product }` 래퍼도 받는다. */
function wingProductOf(form: Record<string, unknown>): Record<string, unknown> {
  const wrapped = asRaw(form.product);
  return Object.keys(wrapped).length > 0 && !('categoryCell' in form) ? wrapped : form;
}

/** 화면이 영어로 답한 계정 대조 실패는 운영자 말로 바꾼다. */
function fillFailure(error: string | undefined): RuntimeError {
  if (error && /account identity|identity helper/i.test(error)) {
    return new RuntimeError('REGISTRATION_ACCOUNT_MISMATCH', '쿠팡 윙에 로그인된 판매자 계정을 확인하지 못했거나 등록할 계정과 다릅니다. 열린 탭의 계정을 확인해 주세요.', { mallKey: 'coupang' });
  }
  return new RuntimeError(REGISTRATION_FILL_FAILED, error ?? '쿠팡 윙 상품등록 폼을 채우지 못했습니다. 열린 탭에서 직접 입력해 주세요.', { mallKey: 'coupang' });
}

async function fillWing(context: MallWriteContext, page: TabPage, input: MallFillInput): Promise<{ fill: MallFill; providerAccountId: string | null }> {
  const product = wingProductOf(input.form);
  const expected = input.expectedProviderAccountId?.trim() ?? '';
  if (!VENDOR_ID.test(expected)) {
    throw new RuntimeError(RUNTIME_PLAN_INVALID, '승인된 쿠팡 윙 판매자 식별자가 없어 채우지 않았습니다.', { mallKey: 'coupang', reason: 'provider_account' });
  }
  // 문서가 뜬 뒤에도 필요한 런타임 기능이 있는지 확인하고 없으면 채운다(옛 `ensure`). 못 하면 폼을 건드리지 않는다.
  const compat = await callPage<{ ok?: boolean; error?: string }>(page, 'wing.compat', {}, {
    timeoutMs: COMPAT_TIMEOUT_MS,
    guard: context.guard,
    main: [WING_COMPAT_FILE],
    displayName: context.displayName,
  });
  if (compat?.ok !== true) {
    throw new RuntimeError(REGISTRATION_FILL_FAILED, `쿠팡 윙 상품등록 화면을 준비하지 못했습니다. ${compat?.error ?? ''}`.trim(), { mallKey: 'coupang', stage: 'compat' });
  }
  const loaded = await toDataUrls(context.fetch, storageImageUrls(product).map((url) => ({ name: url, url })));
  const imageData = Object.fromEntries(loaded.filter((image) => image.dataUrl).map((image) => [image.name, image.dataUrl!]));
  const outcome = await callPage<WingFillAnswer>(page, 'wing.fill', { product, expectedVendorId: expected, imageData }, {
    timeoutMs: FILL_TIMEOUT_MS,
    guard: context.guard,
    isolated: [WING_IDENTITY_FILE, WING_REGISTER_FILE],
    displayName: context.displayName,
  });
  if (outcome?.ok !== true) throw fillFailure(outcome?.error);
  const warnings = loaded.filter((image) => image.error).map((image) => `사진을 읽지 못했습니다: ${image.error}`);
  return {
    fill: { steps: outcome.steps ?? [], warnings, manualSteps: [], dialogs: [] },
    providerAccountId: outcome.evidence?.wingVendorId ?? null,
  };
}

async function submitWing(context: MallWriteContext, page: TabPage): Promise<MallSubmission> {
  const answer = await callPage<WingSubmitAnswer>(page, 'wing.submit', {}, {
    timeoutMs: SUBMIT_TIMEOUT_MS,
    guard: context.guard,
    isolated: [WING_IDENTITY_FILE, WING_REGISTER_FILE],
    displayName: context.displayName,
  });
  const observed = await page.currentUrl().catch(() => null);
  return {
    pressed: answer?.clicked === true,
    // 완료 안내를 봤으면 받았다, 못 봤으면 모른다 — 추측으로 성공을 보고하지 않는다.
    accepted: answer?.status === 'registered' ? true : null,
    externalListingId: answer?.externalListingId ?? null,
    observedUrl: observed ? observed.split(/[?#]/)[0]! : null,
    mallMessage: answer?.error ?? null,
  };
}

registerMallWriter({
  mallKey: 'coupang',
  displayName: '쿠팡 윙',
  guard: WING_WRITE_GUARD,
  dialogHosts: ['wing.coupang.com'],
  login: WING_LOGIN,
  custom: {
    url: wingFormUrl,
    bootstrapFile: WING_COMPAT_FILE,
    fill: fillWing,
    submit: submitWing,
  },
});
