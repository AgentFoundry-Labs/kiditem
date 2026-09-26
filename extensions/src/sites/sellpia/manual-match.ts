import { RuntimeError } from '../../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../../core/site-caller';
import { callPage } from '../page-call';
import { leftForOperator, type TabPage, type TabPages } from '../tab-page';
import { SELLPIA_ORIGIN, SELLPIA_PAGE_GUARD } from './tracking';

/** 수동상품매칭 화면. 검색·상태 요청은 이 화면의 같은 출처 POST다. */
export const SELLPIA_MANUAL_MATCH_URL = `${SELLPIA_ORIGIN}/product_manual_match.html`;
export const SELLPIA_MANUAL_MATCH_FILE = 'content/orders/sellpia-manual-match.js';
/** 옛 수집기의 탭 준비 제한(45초). 묶음 하나(검색 100코드·동시 4, 요청마다 15초)가 넉넉히 끝나는 시간. */
const NAVIGATION_TIMEOUT_MS = 45_000;
const SEARCH_TIMEOUT_MS = 10 * 60_000;
const STATUS_TIMEOUT_MS = 60_000;
const LOGIN_MESSAGE = '셀피아 로그인이 필요합니다. 열린 수동상품매칭 화면에서 로그인한 뒤 다시 시도해 주세요.';
const MALL_CONTRACT_CHANGED = 'MALL_CONTRACT_CHANGED' as const;

/** 검색이 돌려준 후보 하나. md5는 상태 조회에만 쓰고 서버에 보내지 않는다. */
export interface SellpiaManualMatchCandidate {
  productCode: string;
  aliasTitle: string;
  matchMd5: string;
  itemCount: number;
}

type PageAnswer<T> =
  | ({ status: 'ok' } & T)
  | { status: 'login_required' }
  | { status: 'http_error'; httpStatus: number }
  | { status: 'contract_drift'; stage: string }
  | { status: 'timeout' }
  | { status: 'invalid_response' }
  | { status: 'network_failed' };

/**
 * 셀피아 수동상품매칭 화면 읽기(KID-363 L3). 운영자 탭은 건드리지 않고 백그라운드 탭을 새로 열어 수동상품매칭 화면에서
 * 묶음마다 페이지 호출(ISOLATED 처리기 파일)로 읽는다. 여러 묶음을 읽는 동안 탭은 하나이고 `closeManualMatch()`가 닫는다
 * — 로그인 화면에서 멈췄으면 운영자가 로그인하도록 남긴다. 탭 잠금은 서버 lockKey `resource:sellpia:login`이 한다.
 */
export function createSellpiaManualMatch(tabs: TabPages) {
  let tab: Promise<TabPage> | null = null;
  let opened: TabPage | null = null;
  let keepOpen = false;

  function page(): Promise<TabPage> {
    tab ??= (async () => {
      const next = await tabs.open('about:blank');
      opened = next;
      await next.navigate(SELLPIA_MANUAL_MATCH_URL, { timeoutMs: NAVIGATION_TIMEOUT_MS });
      return next;
    })();
    return tab;
  }

  async function ask<T>(call: string, args: unknown, timeoutMs: number): Promise<T> {
    try {
      const answer = await callPage<PageAnswer<T>>(await page(), call, args, {
        timeoutMs,
        guard: SELLPIA_PAGE_GUARD,
        isolated: [SELLPIA_MANUAL_MATCH_FILE],
        displayName: '셀피아',
      });
      switch (answer?.status) {
        case 'ok':
          return answer as T;
        case 'login_required':
          throw new RuntimeError(SITE_LOGIN_REQUIRED, LOGIN_MESSAGE, { url: SELLPIA_MANUAL_MATCH_URL });
        case 'contract_drift':
          throw new RuntimeError(MALL_CONTRACT_CHANGED, `셀피아 수동상품매칭 화면이 바뀌어 읽지 못했습니다. [${answer.stage}]`, { stage: answer.stage });
        case 'http_error':
          throw new RuntimeError(SITE_REQUEST_FAILED, `셀피아 수동상품매칭 요청이 실패했습니다(HTTP ${answer.httpStatus}).`, {
            status: answer.httpStatus, url: SELLPIA_MANUAL_MATCH_URL, reason: 'http', bodyHead: null,
          });
        case 'timeout':
          throw new RuntimeError(SITE_REQUEST_FAILED, '셀피아 수동상품매칭 근거 수집 시간이 초과되었습니다.', {
            status: null, url: SELLPIA_MANUAL_MATCH_URL, reason: 'timeout', bodyHead: null,
          });
        default:
          throw new RuntimeError(SITE_REQUEST_FAILED, '셀피아 수동상품매칭 응답 형식이 예상과 다릅니다.', {
            status: null, url: SELLPIA_MANUAL_MATCH_URL, reason: 'not_json', bodyHead: null,
          });
      }
    } catch (error) {
      if (leftForOperator(error)) keepOpen = true;
      throw error;
    }
  }

  return {
    /** 대상 코드마다 매칭 검색(동시 4). 매칭 제목이 없는 줄은 뺀다. */
    async manualMatchSearch(codes: readonly string[]): Promise<SellpiaManualMatchCandidate[]> {
      return (await ask<{ candidates: SellpiaManualMatchCandidate[] }>('sellpia.manualMatchSearch', { codes: [...codes] }, SEARCH_TIMEOUT_MS)).candidates;
    },
    /** md5 100개 이하의 매칭 종류(M·P·E). */
    async manualMatchStatus(matchMd5s: readonly string[]): Promise<Record<string, 'M' | 'P' | 'E'>> {
      return (await ask<{ types: Record<string, 'M' | 'P' | 'E'> }>('sellpia.manualMatchStatus', { matchMd5s: [...matchMd5s] }, STATUS_TIMEOUT_MS)).types;
    },
    /** 수동매칭이 연 탭을 닫는다. 로그인·예상 밖 주소에서 멈췄으면 남긴다. */
    async closeManualMatch() {
      if (opened && !keepOpen) await opened.close();
      opened = null;
      tab = null;
    },
  };
}
