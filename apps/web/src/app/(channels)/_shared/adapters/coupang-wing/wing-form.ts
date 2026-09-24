import {
  detectWingFormExtensionId,
  KIDITEM_WING_FORM_PORT_NAME,
  sendToExtensionViaPort,
} from '@/lib/extension-bridge';
import type { MallFormExecutionOptions, MallSendOutcome } from '../../mall-publish-adapter';
import type { WingProduct } from './wing-registration-excel';

/**
 * 쿠팡 WING 상품등록 폼(formV2)을 확장으로 채운다. [상품등록]은 등록 실행 컨텍스트가 있을 때만 누른다 —
 * 웹은 `mallFormExecutionOptions` 가 준 값만 보내고, 확장이 같은 관문(`shouldPressRegister`)으로 다시 본다.
 */

/**
 * WING formV2 는 카테고리 로딩과 이미지 CDN 업로드를 차례로 한다. 실제 채움이 15초를 쉽게 넘으므로
 * 브리지 기본 제한을 쓰면 폼이 채워지는 중인데 웹만 먼저 실패한다.
 */
export const WING_FORM_FILL_TIMEOUT_MS = 180_000;

/**
 * 확장이 돌려주는 제출 결과. `registered` 는 완료 안내를 본 것, `unknown` 은 눌렀지만 완료를 확인하지 못한 것,
 * `no_button` 은 아무것도 누르지 않은 것이다.
 */
interface WingSubmission {
  attempted?: boolean;
  clicked?: boolean;
  ok?: boolean;
  status?: 'no_button' | 'registered' | 'unknown';
  externalListingId?: string | null;
  error?: string;
}

interface WingFormResponse {
  ok?: boolean;
  error?: string;
  submission?: WingSubmission;
  submitSkipped?: string;
  evidence?: { wingVendorId?: string; wingIdentitySource?: string };
}

export class WingFormNotReachedError extends Error {}

export async function sendWingForm(
  input: { product: WingProduct; expectedVendorId: string } & MallFormExecutionOptions,
): Promise<WingFormResponse> {
  const extensionId = await detectWingFormExtensionId();
  if (!extensionId) {
    // MV3 서비스워커는 놀면 잠든다. 없는 확장과 잠든 확장을 같은 말로 뭉개면 사람은 멀쩡한 확장을 계속
    // 리로드하므로, 한 번 더 누르는 길을 먼저 적는다.
    throw new WingFormNotReachedError(
      'KidItem 확장이 응답하지 않습니다. 확장이 잠들어 있으면 잠깐 뒤 한 번 더 눌러 보세요. '
      + '그래도 같으면 확장을 리로드하고 이 페이지도 새로고침(F5)한 뒤 다시 시도하세요.',
    );
  }
  return sendToExtensionViaPort<WingFormResponse>(
    extensionId,
    KIDITEM_WING_FORM_PORT_NAME,
    {
      action: 'registerToWingForm',
      product: input.product,
      submit: input.submit,
      ...(input.submit ? { executionContext: input.executionContext } : {}),
      expectedVendorId: input.expectedVendorId,
    },
    WING_FORM_FILL_TIMEOUT_MS,
  );
}

const FILL_ONLY_STEP = '열린 WING 탭에서 채운 값을 확인하세요. 폼만 채웠고 [상품등록]은 누르지 않았습니다.';

/** 확장 응답 → 송신 결과. 채운 것도 누른 것도 등록 확인이 아니다 — 확인은 서버가 증거로 판정한다. */
export function wingFormOutcome(response: WingFormResponse | null | undefined, submitRequested: boolean): MallSendOutcome {
  const submission = response?.submission;
  if (!response?.ok) {
    // 채우다 멈췄으면 [상품등록]은 채움이 끝난 뒤에만 누르므로 몰에 올라간 것이 없다. 눌렀다고 보고했을 때만 모른다.
    return {
      ok: false,
      confirmed: false,
      ...(submission?.attempted === true ? {} : { submitted: false }),
      manualSteps: [],
      warnings: [],
      error: response?.error || '쿠팡 WING 상품등록 폼을 채우지 못했습니다. 확장을 리로드했는지 확인하세요.',
    };
  }
  if (submission?.attempted !== true || submission.clicked === false || submission.status === 'no_button') {
    return {
      ok: !submitRequested,
      confirmed: false,
      submitted: false,
      manualSteps: [
        ...(response.submitSkipped ? [`[상품등록]을 누르지 않았습니다(${response.submitSkipped}).`] : []),
        FILL_ONLY_STEP,
      ],
      warnings: [],
      ...(submitRequested ? { error: submission?.error ?? '[상품등록]을 누르지 못했습니다. 열린 WING 탭을 확인하세요.' } : {}),
    };
  }
  const externalListingId = submission.externalListingId?.trim() || null;
  if (submission.status === 'registered' && submission.ok === true && externalListingId) {
    const vendorId = response.evidence?.wingVendorId?.trim();
    return {
      ok: true,
      confirmed: false,
      submitted: true,
      accepted: true,
      productNo: externalListingId,
      manualSteps: [],
      warnings: [],
      ...(vendorId ? { providerEvidence: { providerAccountId: vendorId, externalListingId } } : {}),
    };
  }
  return {
    ok: false,
    confirmed: false,
    submitted: true,
    accepted: null,
    productNo: externalListingId,
    manualSteps: [],
    warnings: ['열린 WING 탭에서 등록 여부를 확인하세요. 결과를 모르는 실행은 다시 보내지 않습니다.'],
    error: submission.error ?? '[상품등록]을 눌렀지만 완료를 확인하지 못했습니다.',
  };
}
