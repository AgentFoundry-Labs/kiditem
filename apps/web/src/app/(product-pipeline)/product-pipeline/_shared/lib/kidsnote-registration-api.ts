import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';
import {
  prepareSavedCandidateDetailImage,
  requireRenderedDetailImage,
} from '../../collected-products/lib/wing-registration-flow';
import { productsApi } from '../../collected-products/lib/sourcing-api';
import {
  kidsnoteFormFromDraft,
  type KidsnoteRegistrationOptions,
} from './kidsnote-registration-form';
import {
  candidateToMallProductDraft,
  KIDITEM_MALL_DRAFT_DEFAULTS,
  mallProductDraftGaps,
  type MallProductDraft,
} from './mall-product-draft';

/**
 * 키즈노트 상품등록 폼 자동 채움 호출.
 *
 * 확장이 등록 화면을 열고 폼을 채운다. **제출은 하지 않는다** — 키즈노트 등록은
 * 몰 승인이 붙는 신청이라 되돌리기 어렵다. 사람이 화면에서 확인하고 누른다.
 */

/** 이미지 다운로드·화면 로딩·고시 칸 생성까지 걸리는 시간을 감안한다. */
const KIDSNOTE_FILL_TIMEOUT_MS = 120_000;

export interface KidsnoteRegistrationResult {
  ok: boolean;
  tabId?: number;
  submitted: boolean;
  steps: string[];
  /** 확장이 채우지 못했거나 확인이 필요한 것. */
  warnings: string[];
  /** 사람이 화면에서 마저 해야 하는 것. */
  manualSteps: string[];
  error?: string;
}

interface ExtensionResponse {
  ok?: boolean;
  success?: boolean;
  tabId?: number;
  submitted?: boolean;
  steps?: string[];
  warnings?: string[];
  manualSteps?: string[];
  error?: string;
}

export async function fillKidsnoteRegistrationForm(
  draft: MallProductDraft,
  options: KidsnoteRegistrationOptions,
): Promise<KidsnoteRegistrationResult> {
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
      + '키즈노트 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }

  const form = kidsnoteFormFromDraft(draft, options);
  let response: ExtensionResponse;
  try {
    response = await sendToExtension<ExtensionResponse>(
      extensionId,
      { action: 'registerToKidsnoteForm', form },
      KIDSNOTE_FILL_TIMEOUT_MS,
    );
  } catch (error) {
    // 확장이 이 액션을 모르면 아무도 응답하지 않고 포트가 닫힌다. Chrome 이 주는
    // 원문("The message port closed before a response was received")은 원인을
    // 전혀 알려주지 않아서, 실제 원인인 "확장이 옛 버전"으로 바꿔 말한다.
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error(
        '설치된 확장이 키즈노트 상품등록을 아직 모릅니다. '
        + 'chrome://extensions 에서 KidItem 확장을 새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 시도하세요.',
      );
    }
    throw error;
  }

  const ok = response?.ok === true || response?.success === true;
  return {
    ok,
    ...(typeof response?.tabId === 'number' ? { tabId: response.tabId } : {}),
    // 확장은 제출하지 않는다. 응답이 어떻든 제출됐다고 보고하지 않는다.
    submitted: false,
    steps: response?.steps ?? [],
    warnings: response?.warnings ?? [],
    manualSteps: response?.manualSteps ?? form.manualSteps,
    ...(ok ? {} : { error: response?.error ?? '키즈노트 폼을 채우지 못했습니다.' }),
  };
}

/**
 * 수집상품 하나를 키즈노트에 보낼 초안으로 만든다.
 *
 * 상세설명은 저장된 상세페이지를 이미지 1장으로 렌더해서 쓴다. 없으면 여기서
 * 멈춘다 — 대표이미지나 수집 원본으로 대체하지 않는다. 잘못된 상세페이지가
 * 등록되는 것이 등록을 멈추는 것보다 나쁘다.
 */
export async function prepareKidsnoteRegistration(
  salesProductId: string,
): Promise<{ draft: MallProductDraft; detailImageUrl: string }> {
  const detail = await productsApi.getDetail(salesProductId);
  const rendered = await prepareSavedCandidateDetailImage(detail);
  const detailImageUrl = requireRenderedDetailImage(rendered);
  const draft = candidateToMallProductDraft({
    detail,
    defaults: KIDITEM_MALL_DRAFT_DEFAULTS,
    detailImageUrl,
  });
  return { draft, detailImageUrl };
}
