import type { MallTrackingUploadRow, MallTrackingUploadRowResult } from '@kiditem/shared/orders-action-operations';
import { RuntimeError, isRuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { openOperatorTab } from '../operator-tab';
import { callPage } from '../page-call';
import type { SiteSignIn } from '../site-login';
import type { PageGuard, TabPages } from '../tab-page';
import { courierName } from './couriers';

/** 몰 한 곳의 업로드 결과. `confirmedByMall`: 몰이 행마다 받았다고 답했는가(키드키즈처럼 제출만 확인되면 false). */
export interface TrackingUploadOutcome {
  rows: MallTrackingUploadRowResult[];
  confirmedByMall: boolean;
}

/** 몰 업로드 화면 하나(`sites/<mall>/tracking-upload.ts`가 채운다). */
export interface TrackingUploadTarget {
  displayName: string;
  /** 운영자 탭 무늬(앞의 것이 먼저) — 업로드 화면 탭, 그다음 그 몰의 아무 탭. */
  matches: readonly string[];
  url: string;
  /** 지금 주소가 업로드 화면이면 옮기지 않는다. */
  stay(currentUrl: string): boolean;
  guard: PageGuard;
  file: string;
  call: string;
  loginMessage: string;
  timeoutMs(rows: number): number;
  /** 제출만 확인되는 몰(키드키즈): 처리기가 실제로 보냈는가(`submitted`). 없으면 행 답이 곧 몰의 확인이다(온채널). */
  submitOnly?: boolean;
}

interface UploadAnswer {
  status?: 'ok' | 'login_required' | 'unreadable';
  rows?: MallTrackingUploadRowResult[];
  submitted?: boolean;
  error?: string;
}

const ANSWER_LOST = '몰 응답을 받지 못했습니다. 몰 화면에서 반영 여부를 확인해 주세요.';

/**
 * 몰 송장 업로드(KID-366 wave8b, 옛 `uploadOnchTracking`·`uploadKidkidsTracking`의 탭 규칙). 몰에 쓰는 단계라 운영자 탭을 쓰고
 * 앞으로 가져온다(`openOperatorTab`). 로그인 화면이면 실행 자격으로 그 탭에서 한 번 로그인하고 다시 한다(`signIn`, KID-377).
 * 처리기 답이 끊기면(시간 초과) 몰에 일부 반영됐을 수 있어 던지지 않고 모든 행을 확인 대기로 돌려준다. 탭: 우리가 연 탭은 몰이
 * 모두 받았을 때만 닫고, 실패 행·확인 대기·오류면 운영자에게 남긴다.
 */
export async function uploadInOperatorTab(
  tabs: TabPages,
  signIn: SiteSignIn | undefined,
  target: TrackingUploadTarget,
  rows: readonly MallTrackingUploadRow[],
): Promise<TrackingUploadOutcome> {
  const { page, opened } = await openOperatorTab(tabs, { matches: target.matches, url: target.url, stay: target.stay });
  let close = false;
  try {
    const args = { rows: rows.map((row) => ({ orderNo: row.orderNo, trackingNumber: row.trackingNumber, courierName: courierName(row.courier) })) };
    const read = async (): Promise<UploadAnswer> => {
      const answer = await callPage<UploadAnswer>(page, target.call, args, {
        timeoutMs: target.timeoutMs(rows.length),
        guard: target.guard,
        isolated: [target.file],
        displayName: target.displayName,
      });
      if (answer?.status === 'login_required') throw new RuntimeError(SITE_LOGIN_REQUIRED, target.loginMessage, { url: target.url });
      if (answer?.status !== 'ok' || !Array.isArray(answer.rows)) {
        throw new RuntimeError(SITE_REQUEST_FAILED, answer?.error ?? `${target.displayName} 송장 업로드 화면을 읽지 못했습니다.`, { status: null, reason: 'page_error', url: target.url });
      }
      return answer;
    };
    let answer: UploadAnswer;
    try {
      answer = signIn ? await signIn.onPage(page, target.url, read) : await read();
    } catch (error) {
      if (!answerLost(error)) throw error;
      return { rows: rows.map((row) => ({ orderNo: row.orderNo, status: 'failed', mallMessage: ANSWER_LOST })), confirmedByMall: false };
    }
    const results = answer.rows ?? [];
    const confirmedByMall = !(target.submitOnly && answer.submitted === true);
    close = opened && confirmedByMall && results.every((row) => row.status !== 'failed');
    return { rows: results, confirmedByMall };
  } finally {
    if (close) await page.close();
    else await page.leave();
  }
}

/** 처리기 호출의 답이 끊겼다(시간 초과). 처리기가 스스로 답한 실패(`page_error` 문장 있는 답)와 로그인은 아니다. */
function answerLost(error: unknown): boolean {
  return isRuntimeError(error) && error.code === SITE_REQUEST_FAILED && error.details?.reason === 'timeout';
}
