import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

/**
 * 몰 품절 송신 호출.
 *
 * 확장이 그 몰에 **끝까지 보낸다.** 사람이 몰마다 들어가 다시 누르지 않는다
 * (사장님 2026-09-18: "내가 버튼 누르면 너가 알아서 몰에 들어가서 품절 처리해야지").
 *
 * 상품등록과 다른 이유: 등록은 승인이 붙고 되돌리기 어렵지만, 품절은 같은 화면에서
 * 같은 값으로 되돌릴 수 있다(매니페스트 `supports.resume`). 되돌릴 수 있는 일이라
 * 끝까지 한다.
 *
 * ⚠️ 그래도 `sent` 는 "보냈다"이지 "반영됐다"가 아니다. 반영은 몰 재조회가 답한다.
 */

/** 목록을 읽고 몰마다 한 번씩 보낸다. 몰 관리자는 느리다. */
const SEND_TIMEOUT_MS = 180_000;

/**
 * 품절을 보낼 수 있는 몰.
 *
 * 확장 `mall-availability-send.js` 의 `SPECS` 와 같아야 한다. 여기 없는 몰은 화면에
 * 버튼이 서지 않는다 — 눌러도 아무 일이 안 일어나는 버튼을 만들지 않는다.
 */
export const MALL_AVAILABILITY_SEND_MALLS = ['kkomangse', 'kidkids', 'onch'] as const;

export type MallAvailabilitySendMall = typeof MALL_AVAILABILITY_SEND_MALLS[number];

/** 아직 경로가 없는 몰. 화면이 이유를 그대로 보여 준다. */
export const MALL_AVAILABILITY_PENDING: Readonly<Record<string, string>> = {
  'icecream-mall': '판매상태 일괄변경이 별도 창에서 저장돼 경로가 더 필요합니다.',
};

export function canSendMallAvailability(mallKey: string): mallKey is MallAvailabilitySendMall {
  return (MALL_AVAILABILITY_SEND_MALLS as readonly string[]).includes(mallKey);
}

export interface MallAvailabilitySendResult {
  /** 몰에 실제로 보낸 건수. 반영됐다는 뜻은 아니다. */
  sent: number;
  failed: number;
  /** 보낸 것이 관리자 승인 요청인 몰(온채널). 반영은 승인 뒤다. */
  requestOnly: boolean;
  warnings: string[];
}

interface SendResponse {
  success?: boolean;
  sent?: number;
  failed?: number;
  requestOnly?: boolean;
  warnings?: string[];
  error?: string;
}

export async function sendMallAvailability(
  mallKey: MallAvailabilitySendMall,
  mallProductCodes: readonly string[],
  options: { resume?: boolean } = {},
): Promise<MallAvailabilitySendResult> {
  const codes = [...new Set(mallProductCodes.map((code) => code.trim()).filter(Boolean))];
  if (codes.length === 0) {
    throw new Error('이 몰에는 보낼 상품코드가 없습니다.');
  }

  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 '
      + '해당 몰 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }

  let response: SendResponse;
  try {
    response = await sendToExtension<SendResponse>(
      extensionId,
      { action: 'sendMallAvailability', mallKey, codes, resume: options.resume === true },
      SEND_TIMEOUT_MS,
    );
  } catch (error) {
    // 확장이 이 액션을 모르면 아무도 응답하지 않고 포트가 닫힌다. Chrome 원문은 원인을
    // 알려주지 않으므로 실제 원인으로 바꿔 말한다.
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error(
        '설치된 확장이 아직 품절 송신을 모릅니다. chrome://extensions 에서 KidItem 확장을 '
        + '새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 시도하세요.',
      );
    }
    throw error;
  }

  if (response?.success !== true) {
    throw new Error(response?.error ?? '품절을 보내지 못했습니다.');
  }

  return {
    sent: response.sent ?? 0,
    failed: response.failed ?? 0,
    requestOnly: response.requestOnly === true,
    warnings: response.warnings ?? [],
  };
}
