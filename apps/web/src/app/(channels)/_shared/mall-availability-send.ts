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
export const MALL_AVAILABILITY_SEND_MALLS = ['kkomangse', 'kidkids', 'onch', 'domeggook', 'coupang'] as const;

export type MallAvailabilitySendMall = typeof MALL_AVAILABILITY_SEND_MALLS[number];

/**
 * 아직 그 몰 관리자를 뚫지 않은 몰. 화면이 이유를 그대로 보여 준다.
 *
 * 사방넷 경유는 길로 세지 않는다 — 사방넷 기능을 흡수하고 그만 쓰는 것이 방침이라
 * (KID-251), 몰마다 그 관리자 화면을 직접 뚫는 것만이 길이다.
 */
export const MALL_AVAILABILITY_PENDING: Readonly<Record<string, string>> = {
  'icecream-mall': '저장 경로(goodsCommon.modifyGoodsInfo)는 찾았고 본문 모양이 남았습니다.',
};

/** 길이 없는 몰에 공통으로 붙는 말. 사방넷을 대안으로 제시하지 않는다. */
export const MALL_AVAILABILITY_NO_ROUTE = '이 몰 관리자의 품절 경로를 아직 뚫지 않았습니다.';

export function canSendMallAvailability(mallKey: string): mallKey is MallAvailabilitySendMall {
  return (MALL_AVAILABILITY_SEND_MALLS as readonly string[]).includes(mallKey);
}

export interface MallAvailabilitySendResult {
  /** 몰에 실제로 보낸 건수. 반영됐다는 뜻은 아니다. */
  sent: number;
  failed: number;
  /** 보낸 것이 관리자 승인 요청인 몰(온채널). 반영은 승인 뒤다. */
  requestOnly: boolean;
  /**
   * 보낸 뒤 몰을 다시 읽어 원하는 상태로 확인된 건수(도매꾹). 다시 읽지 않는 몰은 `null` 이다.
   */
  confirmed: number | null;
  warnings: string[];
}

export interface MallAvailabilityOutcome {
  outcome: 'succeeded' | 'attention' | 'failed';
  reasonCode: 'mall_rechecked' | 'awaiting_mall_approval' | 'awaiting_mall_recheck';
}

/**
 * 보낸 결과를 관찰 기록 한 줄로. 몰을 다시 읽어 **보낸 것이 전부 확인된 것만** 성공이다 — 보냈다는
 * 것만으로는 `attention` 이다(반영은 몰 재조회가 답한다).
 */
export function availabilityOutcome(result: MallAvailabilitySendResult): MallAvailabilityOutcome {
  const reasonCode = result.requestOnly ? 'awaiting_mall_approval' : 'awaiting_mall_recheck';
  if (result.failed > 0) return { outcome: 'failed', reasonCode };
  if (!result.requestOnly && result.confirmed !== null && result.sent > 0 && result.confirmed >= result.sent) {
    return { outcome: 'succeeded', reasonCode: 'mall_rechecked' };
  }
  return { outcome: 'attention', reasonCode };
}

interface SendResponse {
  success?: boolean;
  sent?: number;
  failed?: number;
  requestOnly?: boolean;
  confirmed?: number;
  warnings?: string[];
  error?: string;
}

export async function sendMallAvailability(
  mallKey: MallAvailabilitySendMall,
  mallProductCodes: readonly string[],
  options: {
    resume?: boolean;
    /** 상품코드 → 그 상품의 품절 옵션코드. 옵션 단위로 보내는 몰(쿠팡 윙)만 쓴다. 없으면 상품 전체다. */
    optionCodes?: Readonly<Record<string, readonly string[]>>;
  } = {},
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
      {
        action: 'sendMallAvailability',
        mallKey,
        codes,
        resume: options.resume === true,
        ...(options.optionCodes ? { options: options.optionCodes } : {}),
      },
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
    confirmed: typeof response.confirmed === 'number' ? response.confirmed : null,
    warnings: response.warnings ?? [],
  };
}
