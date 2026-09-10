import {
  getFormMallAdapter,
  valuesForMall,
  type MallRegisterValues,
} from '@/app/(channels)/_shared/mall-register-values';
import type { MallPublishItem } from '@/app/(channels)/_shared/mall-publish-adapter';
import { isApiError } from '@/lib/api-error';

/**
 * 몰 등록 실행기.
 *
 * 상품 상세에 적어 둔 값으로 몰 폼을 채운다. 값을 여기서 다시 묻지 않는 것이
 * 요점이다 — 목록에서는 **버튼만 누른다.**
 *
 * 두 가지를 지킨다.
 *
 *  1. **한 번에 한 몰.** 폼 채움은 브라우저 탭 하나를 점유하고, 확장은 그 탭 안에서
 *     이미지를 내려받고 다이얼로그를 연다. 동시에 돌리면 서로의 탭을 밟는다.
 *  2. **막힌 몰에서 멈추지 않는다.** 한 몰이 실패해도 나머지를 계속 채운다. 하나
 *     때문에 전부 못 하면 '한번에 등록하기' 는 쓸모가 없다.
 *
 * 제출은 하지 않는다. 폼을 채운 것은 등록이 아니다.
 */

export type MallRunStatus = 'filled' | 'blocked' | 'failed';

export interface MallRunOutcome {
  mallKey: string;
  mallName: string;
  status: MallRunStatus;
  /** 사람이 읽는 한 줄. 실패면 **무엇 때문에** 안 됐는지가 들어간다. */
  message: string;
  /** 열린 탭에서 마저 해야 하는 것. 성공했을 때만 채워진다. */
  manualSteps: string[];
}

export function mallRunErrorMessage(error: unknown, fallback: string): string {
  if (isApiError(error)) return error.detail;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

interface RunOptions {
  /** 보낼 몰. 순서대로 하나씩 처리한다. */
  mallKeys: readonly string[];
  item: MallPublishItem | null;
  values: MallRegisterValues;
  /** 몰 하나를 시작할 때. 화면이 어느 몰이 도는지 표시한다. */
  onStart?: (mallKey: string) => void;
  /** 몰 하나가 끝날 때. 다음 몰이 시작되기 전에 부른다. */
  onOutcome?: (outcome: MallRunOutcome) => void;
}

/** 몰 하나. 던지지 않는다 — 실패도 결과의 한 줄이다. */
export async function runOneMallRegistration(
  mallKey: string,
  item: MallPublishItem | null,
  values: MallRegisterValues,
): Promise<MallRunOutcome> {
  const adapter = getFormMallAdapter(mallKey);
  if (!adapter) {
    return {
      mallKey,
      mallName: mallKey,
      status: 'blocked',
      message: '이 화면이 모르는 몰입니다. 어댑터가 없습니다.',
      manualSteps: [],
    };
  }
  const base = { mallKey, mallName: adapter.mallName };
  if (!item) {
    return { ...base, status: 'blocked', message: '보낼 상품이 없습니다.', manualSteps: [] };
  }

  const merged = valuesForMall(values, mallKey);
  // 어댑터가 막으면 확장을 부르지 않는다. 반쯤 빈 폼이 열리면 사람이 그대로
  // 제출할 수 있고, 그건 우리가 만든 사고다.
  const blocked = adapter.validate(item, merged);
  if (blocked.length > 0) {
    return { ...base, status: 'blocked', message: blocked.join(' '), manualSteps: [] };
  }

  try {
    const outcome = await adapter.send({ items: [item], values: merged });
    if (!outcome.ok) {
      return {
        ...base,
        status: 'failed',
        message: outcome.error ?? `${adapter.mallName} 폼을 채우지 못했습니다.`,
        manualSteps: [],
      };
    }
    return {
      ...base,
      status: 'filled',
      message: '폼을 채웠습니다. 열린 탭에서 확인하고 직접 등록하세요.',
      manualSteps: [...outcome.warnings, ...outcome.manualSteps],
    };
  } catch (error) {
    return {
      ...base,
      status: 'failed',
      message: mallRunErrorMessage(error, `${adapter.mallName} 상품등록에 실패했습니다.`),
      manualSteps: [],
    };
  }
}

/** 여러 몰. 순서대로 하나씩이고, 하나가 실패해도 멈추지 않는다. */
export async function runMallRegistrations({
  mallKeys,
  item,
  values,
  onStart,
  onOutcome,
}: RunOptions): Promise<MallRunOutcome[]> {
  const outcomes: MallRunOutcome[] = [];
  for (const mallKey of mallKeys) {
    onStart?.(mallKey);
    // eslint-disable-next-line no-await-in-loop -- 탭 하나를 나눠 쓴다. 동시에 돌리면 서로를 밟는다.
    const outcome = await runOneMallRegistration(mallKey, item, values);
    outcomes.push(outcome);
    onOutcome?.(outcome);
  }
  return outcomes;
}

/** 실행 결과 한 줄 요약. 토스트에 그대로 쓴다. */
export function summarizeMallRun(outcomes: readonly MallRunOutcome[]): {
  filled: number;
  failed: MallRunOutcome[];
  title: string;
  description: string;
} {
  const filled = outcomes.filter((outcome) => outcome.status === 'filled');
  const failed = outcomes.filter((outcome) => outcome.status !== 'filled');
  const title = failed.length === 0
    ? `${filled.length}개 몰 폼을 채웠어요`
    : filled.length === 0
      ? '폼을 채우지 못했어요'
      : `${filled.length}개 몰은 채우고 ${failed.length}개는 못 채웠어요`;
  const description = failed.length > 0
    ? failed.map((outcome) => `${outcome.mallName}: ${outcome.message}`).join(' / ')
    : '열린 탭에서 확인하고 직접 등록하세요. 제출은 하지 않았습니다.';
  return { filled: filled.length, failed, title, description };
}
