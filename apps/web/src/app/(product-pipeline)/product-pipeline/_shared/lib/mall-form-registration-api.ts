import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { loadMallLoginCredentials } from '@/lib/mall-login-credentials';
import {
  prepareSavedDetailImage,
  requireRenderedDetailImage,
} from '../../collected-products/lib/detail-page-image-api';
import { productsApi } from '../../collected-products/lib/sourcing-api';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
  mallProductDraftGaps,
  type MallProductDraft,
} from './mall-product-draft';
import type { ChannelKey } from '@kiditem/shared/channel-registry';

/**
 * 도매꾹·온채널 상품등록 폼 자동 채움 호출.
 *
 * 확장이 등록 화면을 열고 폼을 채운다. **제출은 하지 않는다** — 두 몰 다 승인이
 * 붙는 등록이라 되돌리기 어렵다. 사람이 화면에서 확인하고 누른다.
 *
 * 키즈노트와 같은 계약을 쓰되 몰 키를 함께 보낸다. 확장이 그 키로 어느 주소를 열고
 * 어느 폼을 채울지 정한다 — 웹이 몰별 주소를 들고 있지 않게 하는 경계다.
 */

/** 이미지 내려받기·화면 로딩·동적 고시 칸 생성까지 감안한다. */
const MALL_FILL_TIMEOUT_MS = 120_000;

/**
 * 확장에 넘길 채널 키. 몰 키 하나로 통한다 — 확장 폼 스펙 키도, 저장된 계정 키도 같은 값이다.
 *
 * 예전에는 확장 스펙 이름(`gsshop`·`artgonggu`·`alwayz` …)과 계정 키가 달라 웹이 번역표를
 * 들고 있었고, 그 표를 빠뜨린 몰은 자동 로그인이 조용히 아무것도 하지 않았다. 스펠링이
 * 다를 수 있는 자리는 레지스트리의 `formSpec` 한 칸뿐이다(옥션 → 지마켓 ESM 폼).
 *
 * ⚠️ 이 타입은 채널 29개를 모두 받는다. 실제로 채울 폼이 있는 것은 확장 스펙이 있는
 * 16개뿐이고, **레지스트리 행에서는 그 16개를 가려낼 수 없다** — `register` 는 몰이 등록을
 * 어떻게 받는가이지 우리가 폼을 만들어 뒀는가가 아니다(도매꾹은 `none` 인데 스펙이 있고,
 * 보리보리는 `api` 인데 스펙이 있다). 그래서 좁히는 대신, 어댑터가 부르는 키가 모두 확장
 * 스펙에 있는지를 `adapters/index.spec.ts` 가 잠근다.
 */
export type MallFormRegisterMall = ChannelKey;

export interface MallFormRegistrationResult {
  ok: boolean;
  mall: MallFormRegisterMall;
  tabId?: number;
  /** 확장이 몰 [등록]을 눌렀는가. 누른 것도 등록 확인은 아니다. */
  submitted: boolean;
  /** 몰이 받았다고 답했나(true) · 거절했나(false) · 모르나(null). */
  accepted?: boolean | null;
  /** 몰이 준 새 상품번호(보이면). */
  productNo?: string | null;
  /** 몰이 띄운 말(알림 · 확인 창). */
  mallMessage?: string | null;
  /** 부탁했는데 누르지 않은 까닭. */
  submitSkipped?: string | null;
  steps: string[];
  warnings: string[];
  manualSteps: string[];
  error?: string;
}

interface ExtensionResponse {
  ok?: boolean;
  success?: boolean;
  tabId?: number;
  submitted?: boolean;
  accepted?: boolean | null;
  productNo?: string | null;
  mallMessage?: string | null;
  submitSkipped?: string;
  steps?: string[];
  warnings?: string[];
  manualSteps?: string[];
  error?: string;
}

/** Server-issued registration lease carried through the provider bridge. */
export interface MallRegistrationExecutionContext {
  executionId: string;
  payloadHash: string;
  leaseToken: string;
}

export interface MallFormRegistrationOptions {
  submit?: boolean;
  executionContext?: MallRegistrationExecutionContext;
}

/** 확장에 넘기는 폼 지시. 몰마다 모양이 달라 최소 계약만 요구한다. */
export interface MallRegistrationFormPayload {
  url: string;
  manualSteps: string[];
}

export async function fillMallRegistrationForm(
  mall: MallFormRegisterMall,
  draft: MallProductDraft,
  form: MallRegistrationFormPayload,
  options: MallFormRegistrationOptions = {},
): Promise<MallFormRegistrationResult> {
  // 초안이 비어 있으면 확장을 부르지 않는다. 반쯤 빈 폼이 열리면 사람이 그걸
  // 그대로 제출할 수 있고, 그건 우리가 만든 사고다.
  const gaps = mallProductDraftGaps(draft);
  if (gaps.length > 0) {
    throw new Error(`"${draft.displayName}" 등록 준비가 끝나지 않았습니다 — ${gaps.join(' ')}`);
  }

  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 '
      + '해당 몰 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }

  // 로그인이 풀려 있으면 확장이 이 값으로 그 탭에서 로그인한 뒤 다시 채운다. 저장해 둔
  // 계정이 없으면 `null` 이고, 그때는 예전처럼 지금 열려 있는 세션에 기댄다. 11번가 ·
  // 올웨이즈는 채울 로그인 폼이 없어(JWT · 토큰) 확장이 "직접 로그인하세요" 로 멈춘다 —
  // 그게 맞는 동작이다.
  //
  // ESM Plus(`item.esmplus.com`)는 **지마켓 판매자 어드민**이다. 예전에는 확장 스펙 이름이
  // `esmplus` 라 계정을 못 찾고 늘 열린 세션에 기댔지만, 이제 몰 키 `gmarket` 으로 부르므로
  // 쇼핑몰 계정에 저장된 지마켓 아이디 · 비밀번호(`GMARKET_*`)로 자동 로그인이 붙는다.
  // 옥션은 이 등록 한 번에 함께 올라가므로 따로 로그인하지 않는다.
  //
  // ⚠️ 비밀번호가 들어 있다. 로그·토스트·오류 메시지에 싣지 말 것.
  const credentials = await loadMallLoginCredentials(mall);

  let response: ExtensionResponse;
  try {
    response = await sendToExtension<ExtensionResponse>(
      extensionId,
      {
        action: 'registerToMallForm',
        // 몰 키 그대로 넘긴다. **어느 폼을 여는지는 확장이 정한다**(`specFor` 가 레지스트리의
        // `formSpec` 을 거친다) — 양쪽에서 접으면 접는 규칙이 두 곳이 된다.
        mall,
        form,
        ...(options.submit ? { submit: true } : {}),
        ...(options.executionContext ? { executionContext: options.executionContext } : {}),
        accountKey: mall,
        ...(credentials ? { credentials } : {}),
      },
      MALL_FILL_TIMEOUT_MS,
    );
  } catch (error) {
    // 확장이 이 액션을 모르면 아무도 응답하지 않고 포트가 닫힌다. Chrome 원문은
    // 원인을 전혀 알려주지 않아서 실제 원인으로 바꿔 말한다.
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error(
        '설치된 확장이 이 몰의 상품등록을 아직 모릅니다. '
        + 'chrome://extensions 에서 KidItem 확장을 새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 시도하세요.',
      );
    }
    throw error;
  }

  const ok = response?.ok === true || response?.success === true;
  // A fill-only caller must stay fill-only even if an older/newer extension reports
  // a stray `submitted` field. Submission is a caller-owned intent and only the
  // explicit #554 path may classify the extension's submit result.
  const submitted = options.submit === true && response?.submitted === true;
  return {
    ok,
    mall,
    ...(typeof response?.tabId === 'number' ? { tabId: response.tabId } : {}),
    submitted,
    ...(submitted
      ? {
        accepted: response?.accepted ?? null,
        productNo: response?.productNo ?? null,
        mallMessage: response?.mallMessage ?? null,
      }
      : {}),
    ...(response?.submitSkipped ? { submitSkipped: response.submitSkipped } : {}),
    steps: response?.steps ?? [],
    warnings: response?.warnings ?? [],
    manualSteps: response?.manualSteps ?? form.manualSteps,
    ...(ok ? {} : { error: response?.error ?? '상품등록 폼을 채우지 못했습니다.' }),
  };
}

/**
 * 수집상품 하나를 몰에 보낼 초안으로 만든다.
 *
 * 상세설명은 저장된 상세페이지를 이미지 1장으로 렌더해서 쓴다. 없으면 여기서
 * 멈춘다 — 대표이미지나 수집 원본으로 대체하지 않는다.
 */
export async function prepareMallRegistration(
  salesProductId: string,
): Promise<{ draft: MallProductDraft; detailImageUrl: string }> {
  const detail = await productsApi.getDetail(salesProductId);
  const rendered = await prepareSavedDetailImage(detail);
  const detailImageUrl = requireRenderedDetailImage(rendered);
  const draft = candidateToMallProductDraft({
    detail,
    defaults: KIDITEM_MALL_DRAFT_DEFAULTS,
    detailImageUrl,
  });
  return { draft, detailImageUrl };
}

/** [등록]까지 누를 수 있는 몰 목록. 확장 capability를 읽기만 한다. */
export async function detectMallFormSubmitMalls(): Promise<string[]> {
  const extensionId = await detectOrderCollectionExtensionId().catch(() => null);
  if (!extensionId) return [];
  try {
    const response = await sendToExtension<{ success?: boolean; capabilities?: Record<string, unknown> }>(
      extensionId,
      { action: 'ping' },
      1500,
    );
    const malls = response?.capabilities?.mallFormSubmitMalls;
    return Array.isArray(malls) ? malls.filter((mall): mall is string => typeof mall === 'string') : [];
  } catch {
    return [];
  }
}
