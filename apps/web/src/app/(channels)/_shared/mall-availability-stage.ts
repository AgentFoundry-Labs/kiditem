import { detectOrderCollectionExtensionId, sendToExtension } from '@/lib/extension-bridge';

/**
 * 몰 품절 화면 대상 지목 호출.
 *
 * 확장이 그 몰의 품절 화면을 열고 우리가 고른 상품 줄을 체크해 둔다. **제출하지
 * 않는다** — 마지막 버튼은 사람이 누른다. 품절은 되돌릴 수 있지만 되돌리는 데 사람
 * 손이 들고, 그동안 그 상품은 팔리지 않는다. 대신 눌러서 아끼는 시간보다 잘못
 * 눌렀을 때 잃는 매출이 크다.
 *
 * 그래서 이 함수의 성공은 "골라 뒀다"(staged)이지 "보냈다"도 "반영됐다"도 아니다.
 * 반영은 사람이 누른 뒤 몰을 다시 조회해야만 알 수 있다.
 */

/** 화면 로딩 + 목록 렌더까지 감안한다. 몰 관리자는 느리다. */
const STAGE_TIMEOUT_MS = 90_000;

/**
 * 품절 화면을 아는 몰.
 *
 * 확장 `mall-availability-stage.js` 의 `SPECS` 와 같아야 한다. 여기 없는 몰은 화면에
 * 버튼이 서지 않는다 — 눌러도 아무 일이 안 일어나는 버튼을 만들지 않는다.
 */
export const MALL_AVAILABILITY_STAGE_MALLS = [
  'kidkids', 'icecream-mall', 'kkomangse', 'onch',
] as const;

export type MallAvailabilityStageMall = typeof MALL_AVAILABILITY_STAGE_MALLS[number];

export function canStageMallAvailability(mallKey: string): mallKey is MallAvailabilityStageMall {
  return (MALL_AVAILABILITY_STAGE_MALLS as readonly string[]).includes(mallKey);
}

export interface MallAvailabilityStageResult {
  /** 화면에서 실제로 골라 둔 줄 수. */
  staged: number;
  /** 우리 목록에는 있는데 그 화면에 없던 상품 수. */
  missing: number;
  /** 사람이 눌러야 하는 버튼 이름. */
  submitLabel: string;
  submitHint: string;
  resumeHint: string;
  warnings: string[];
}

interface StageResponse {
  success?: boolean;
  staged?: number;
  missing?: number;
  submitLabel?: string;
  submitHint?: string;
  resumeHint?: string;
  warnings?: string[];
  error?: string;
}

export async function stageMallAvailability(
  mallKey: MallAvailabilityStageMall,
  mallProductCodes: readonly string[],
): Promise<MallAvailabilityStageResult> {
  const codes = [...new Set(mallProductCodes.map((code) => code.trim()).filter(Boolean))];
  if (codes.length === 0) {
    throw new Error('이 몰에는 품절로 지목할 상품코드가 없습니다.');
  }

  const extensionId = await detectOrderCollectionExtensionId();
  if (!extensionId) {
    throw new Error(
      '확장프로그램이 필요합니다. extensions/kiditem-os 를 Chrome 에 로드하고 '
      + '해당 몰 관리자에 로그인한 뒤 다시 시도하세요.',
    );
  }

  let response: StageResponse;
  try {
    response = await sendToExtension<StageResponse>(
      extensionId,
      { action: 'stageMallAvailability', mallKey, codes },
      STAGE_TIMEOUT_MS,
    );
  } catch (error) {
    // 확장이 이 액션을 모르면 아무도 응답하지 않고 포트가 닫힌다. Chrome 원문은 원인을
    // 알려주지 않으므로 실제 원인으로 바꿔 말한다.
    const message = error instanceof Error ? error.message : String(error);
    if (/message port closed/i.test(message)) {
      throw new Error(
        '설치된 확장이 아직 품절 지목을 모릅니다. chrome://extensions 에서 KidItem 확장을 '
        + '새로고침한 뒤 이 페이지도 새로고침(F5)하고 다시 시도하세요.',
      );
    }
    throw error;
  }

  if (response?.success !== true) {
    throw new Error(response?.error ?? '품절 화면에서 대상을 고르지 못했습니다.');
  }

  return {
    staged: response.staged ?? 0,
    missing: response.missing ?? 0,
    submitLabel: response.submitLabel ?? '저장',
    submitHint: response.submitHint ?? '',
    resumeHint: response.resumeHint ?? '',
    warnings: response.warnings ?? [],
  };
}
