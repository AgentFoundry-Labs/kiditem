import { RuntimeError } from '../core/errors';
import { SITE_REQUEST_FAILED } from '../core/site-caller';
import type { PageAnswer, PageGuard, TabPage } from './tab-page';

/**
 * 페이지 호출(KID-359 H3) — 몰 화면을 그 페이지의 출처·쿠키로 읽어야 하는 사이트가 쓴다. 인자를 넘겨야 하는데 파일
 * 주입은 인자를 못 받고 `func.toString()`은 쓰지 않으므로(README), ISOLATED 브리지가 런타임 메시지를 받아 같은 world
 * 처리기나 MAIN world 러너로 넘긴다(`kiditem-os/content/page-call/`). 처리기가 없으면 브리지가
 * `content_script_missing`으로 답하고 `TabPage.ask`가 파일을 주입한 뒤 한 번 더 묻는다.
 */
export const PAGE_CALL_BRIDGE_FILE = 'content/page-call/bridge.js';
export const PAGE_CALL_RUNNER_FILE = 'content/page-call/runner.js';
export const PAGE_CALL_MESSAGE = 'KIDITEM_PAGE_CALL';

export interface PageCallAnswer<T> extends PageAnswer {
  value?: T;
}

export interface PageCallOptions {
  timeoutMs: number;
  guard: PageGuard;
  /** 처리기 파일. MAIN world 처리기는 `main`, 페이지 변수가 필요 없는 DOM 처리기는 `isolated`. */
  main?: readonly string[];
  isolated?: readonly string[];
  /** 운영자에게 보이는 사이트 이름(오류 문장). */
  displayName: string;
  /** 물을 프레임(없으면 맨 위 문서). 처리기 파일도 그 프레임에만 넣는다. */
  frameId?: number;
  /**
   * ISOLATED 처리기에서만 부른다(`world: 'isolated'`). 처리기가 없으면 브리지가 MAIN으로 넘기지 않고 파일을 다시 넣게 한다 —
   * 저장 자격을 싣는 로그인 폼 채우기(KID-377)처럼 인자가 페이지에 가면 안 되는 호출.
   */
  isolatedOnly?: boolean;
}

export async function callPage<T>(page: TabPage, call: string, args: unknown, options: PageCallOptions): Promise<T> {
  const answer = await page.ask<PageCallAnswer<T>>(
    { type: PAGE_CALL_MESSAGE, call, args, ...(options.isolatedOnly ? { world: 'isolated' } : {}) },
    {
      timeoutMs: options.timeoutMs,
      guard: options.guard,
      ...(options.frameId !== undefined ? { frameId: options.frameId } : {}),
      inject: {
        isolated: [PAGE_CALL_BRIDGE_FILE, ...(options.isolated ?? [])],
        // MAIN world 처리기가 있을 때만 러너를 넣는다(ISOLATED 처리기는 브리지가 바로 부른다).
        ...(options.main?.length ? { main: [PAGE_CALL_RUNNER_FILE, ...options.main] } : {}),
      },
    },
  );
  if (answer.ok === true) return answer.value as T;
  if (answer.error === 'timeout') {
    throw new RuntimeError(SITE_REQUEST_FAILED, `${options.displayName} 화면이 제때 응답하지 않았습니다.`, { status: null, reason: 'timeout', call });
  }
  throw new RuntimeError(SITE_REQUEST_FAILED, `${options.displayName} 화면에서 읽지 못했습니다: ${answer.error ?? '알 수 없음'}`, {
    status: null,
    reason: 'page_error',
    call,
  });
}
