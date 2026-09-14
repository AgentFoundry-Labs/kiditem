import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import { loadMallLoginCredentials } from '@/lib/mall-login-credentials';
import {
  prepareSavedCandidateDetailImage,
  requireRenderedDetailImage,
} from '../../collected-products/lib/wing-registration-flow';
import { productsApi } from '../../collected-products/lib/sourcing-api';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
  mallProductDraftGaps,
  type MallProductDraft,
} from './mall-product-draft';

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

export type MallFormRegisterMall =
  | 'domeggook' | 'onch' | 'artgonggu' | 'alwayz' | 'teacherville' | '11st' | 'icecream'
  | 'esmplus' | 'boribori' | 'kkomangse' | 'thirtymall' | 'kidkids' | 'ssg' | 'smartstore' | 'gsshop' | 'lotteon';

/**
 * 확장 폼 스펙 이름 → 쇼핑몰 계정 키.
 *
 * 둘이 다른 것이 정상이다. 스펙 이름은 확장 안에서 "어느 폼을 채우나" 이고, 계정 키는
 * 서버가 자격증명을 묶어 둔 이름이다. 섞으면 자동 로그인이 조용히 아무것도 안 한다.
 *
 * 11번가·올웨이즈는 채울 로그인 폼이 없다(JWT·토큰 방식). 자격증명을 넘겨도 확장이
 * 로그인하지 못하고 "직접 로그인하세요" 로 멈춘다 — 그게 맞는 동작이다.
 */
export const MALL_ACCOUNT_KEY: Record<MallFormRegisterMall, string> = {
  domeggook: 'domeggook',
  onch: 'onch',
  artgonggu: 'art09',
  alwayz: 'always',
  teacherville: 'teacher-mall',
  '11st': '11st',
  icecream: 'icecream-mall',
  // ESM Plus(G마켓·옥션)는 주문수집에 붙어 있지 않아 저장된 계정이 없다. 그래서 이 키로
  // 찾으면 `null` 이 나오고, 확장은 예전처럼 지금 열려 있는 세션에 기댄다 — 맞는 동작이다.
  // 사장님이 나중에 쇼핑몰 계정 설정에 넣으면 그때부터 자동 로그인이 붙는다.
  esmplus: 'esmplus',
  // 주문수집에 이미 붙어 있는 몰이라 저장된 계정이 있다 — 자동 로그인이 붙는다.
  boribori: 'boribori',
  // 주문수집에 이미 붙어 있다 — 저장된 계정으로 자동 로그인이 붙는다.
  kkomangse: 'kkomangse',
  // 쇼핑몰 계정 목록에 이미 있는 키다(주문수집은 아직). 샵바이 로그인 화면은 실측 전이라
  // 자동 로그인이 못 붙으면 확장이 "직접 로그인하세요" 로 멈춘다 — 그게 맞는 동작이다.
  thirtymall: 'thirtymall',
  // 주문수집·송장 등록에 이미 붙어 있는 몰이라 저장된 계정으로 자동 로그인이 붙는다.
  kidkids: 'kidkids',
  // 쇼핑몰 계정 목록에 있는 키다. 파트너오피스 로그인 화면은 실측 전이라 자동 로그인이 못
  // 붙으면 확장이 "직접 로그인하세요" 로 멈춘다.
  ssg: 'ssg',
  // 서버 매니페스트 키와 같다. 스마트스토어 로그인 화면은 실측 전이라 자동 로그인이 못 붙으면
  // 확장이 "직접 로그인하세요" 로 멈춘다.
  smartstore: 'smartstore',
  // 주문수집에 이미 붙어 있는 몰 키다. 파트너스 로그인 화면은 실측 전이라 자동 로그인이 못 붙으면
  // 확장이 "직접 로그인하세요" 로 멈춘다.
  gsshop: 'gs-shop',
  // 주문수집에 이미 붙어 있는 몰 키다. 롯데ON 로그인은 통합회원 화면이라 자동 로그인이 못 붙으면
  // 확장이 "직접 로그인하세요" 로 멈춘다.
  lotteon: 'lotte-on',
};

export interface MallFormRegistrationResult {
  ok: boolean;
  mall: MallFormRegisterMall;
  tabId?: number;
  /** 폼을 채운 것은 등록이 아니다. 언제나 false 다. */
  submitted: boolean;
  steps: string[];
  warnings: string[];
  manualSteps: string[];
  error?: string;
}

interface ExtensionResponse {
  ok?: boolean;
  success?: boolean;
  tabId?: number;
  steps?: string[];
  warnings?: string[];
  manualSteps?: string[];
  error?: string;
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
  // 계정이 없으면 `null` 이고, 그때는 예전처럼 지금 열려 있는 세션에 기댄다.
  //
  // ⚠️ 비밀번호가 들어 있다. 로그·토스트·오류 메시지에 싣지 말 것.
  const accountKey = MALL_ACCOUNT_KEY[mall];
  const credentials = await loadMallLoginCredentials(accountKey);

  let response: ExtensionResponse;
  try {
    response = await sendToExtension<ExtensionResponse>(
      extensionId,
      {
        action: 'registerToMallForm',
        mall,
        form,
        accountKey,
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
  return {
    ok,
    mall,
    ...(typeof response?.tabId === 'number' ? { tabId: response.tabId } : {}),
    // 확장은 제출하지 않는다. 응답이 어떻든 제출됐다고 보고하지 않는다.
    submitted: false,
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
  candidateId: string,
): Promise<{ draft: MallProductDraft; detailImageUrl: string }> {
  const detail = await productsApi.getDetail(candidateId);
  const rendered = await prepareSavedCandidateDetailImage(candidateId, detail);
  const detailImageUrl = requireRenderedDetailImage(rendered);
  const draft = candidateToMallProductDraft({
    detail,
    defaults: KIDITEM_MALL_DRAFT_DEFAULTS,
    detailImageUrl,
  });
  return { draft, detailImageUrl };
}
