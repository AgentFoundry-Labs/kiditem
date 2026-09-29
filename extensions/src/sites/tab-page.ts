import { RuntimeError, isRuntimeError } from '../core/errors';
import { SITE_LOGIN_REQUIRED, SITE_REQUEST_FAILED } from '../core/site-caller';

/**
 * 사이트가 DOM을 읽어야 할 때 쓰는 탭 한 장(KID-360). 사이트는 탭을 열고(백그라운드), 주소를 옮기고, 다 그려질 때까지
 * 기다리고, 그 탭의 content script에 메시지를 보낸다. content script가 아직 없으면 파일을 주입하고 다시 보낸다
 * (`func.toString()` 주입은 쓰지 않는다 — README). 서버·실행은 모른다.
 */
export interface TabPage {
  readonly tabId: number;
  /**
   * 주소를 옮기고 다 그려질 때까지(또는 막힘 주소가 될 때까지) 기다린다. 마지막 주소를 돌려준다. `continueOnTimeout`이면
   * 시간이 다 돼도 실패하지 않고 그때 주소를 돌려준다(끝없이 불러오는 화면도 이미 그린 것을 읽는 사이트). 탭이 닫히면 늘 실패.
   * `bootstrapFile`(확장 파일)이 있으면 그 파일을 새 문서 스크립트로 먼저 등록하고 옮긴다 — 페이지 번들보다 먼저 돌아야 하는
   * 보완(Wing formV2 런타임 호환, KID-256). 정적 document_start content script도 번들과 경합할 수 있어 디버거로 건다.
   */
  navigate(url: string, options: { timeoutMs: number; stopAt?: (url: string) => boolean; continueOnTimeout?: boolean; bootstrapFile?: string }): Promise<string>;
  /**
   * 탭 주소가 `blocked`(검증 화면)인 동안 2초마다 본다 — 운영자가 열려 있는 탭에서 검증을 통과하길 기다린다. 벗어나면
   * true, 10분이 지나면 false. 기다리는 동안 3분마다 `onRemind`(임대 연장·progress). 탭이 닫히면 실패.
   */
  waitWhile(blocked: (url: string) => boolean | Promise<boolean>, options: { onRemind?(): void | Promise<void> }): Promise<boolean>;
  /** 이 탭을 활성 탭으로 앞으로 가져온다 — 운영자가 이 탭에서 할 일이 있을 때(GS샵 SMS 인증, KID-380). */
  focus(): Promise<void>;
  /** 지금 탭 주소를 기다리지 않고 읽는다(운영자 탭). */
  currentUrl(): Promise<string>;
  /**
   * content script에 메시지를 보내고 답을 기다린다. 받는 쪽이 없으면 `inject`의 파일(ISOLATED·MAIN)을 주입하고
   * 한 번 더 보낸다. 시간이 지나면 `{ ok: false, error: 'timeout' }`.
   */
  ask<T extends PageAnswer>(message: Record<string, unknown>, options: { timeoutMs: number; inject?: InjectFiles; guard?: PageGuard; frameId?: number }): Promise<T>;
  /**
   * 파일 하나를 탭의 모든 프레임에 넣고 프레임마다 그 파일의 마지막 식 값을 돌려준다(값이 없는 프레임은 뺀다). 화면이
   * 프레임으로 나뉜 몰(아이스크림몰 배송조회)이 어느 프레임을 읽을지 고를 때 쓴다(KID-359 H3). `frameId` 0이 맨 위 문서다.
   */
  frames<T>(files: readonly string[]): Promise<Array<{ frameId: number; result: T }>>;
  /** 이 탭에서 오는 runtime 메시지를 받는다(상품 추출처럼 content script가 먼저 말하는 경우). 해제 함수를 돌려준다. */
  listen(listener: (message: Record<string, unknown>) => void): () => void;
  /** 이 사이트가 연 탭이면 닫는다(운영자 탭은 닫지 않는다). */
  close(): Promise<void>;
  /**
   * 닫지 않고 운영자에게 넘긴다(KID-256 — 몰 쓰기가 채운 등록 폼은 성공해도 사람이 본다). 수집 탭에서 빼고 가드 짝에 알려
   * 진짜 알림 창으로 돌린다. `keep`과 달리 남긴 탭으로 적지 않는다 — 같은 몰에 이어 채운 다음 폼이 이 탭을 닫지 않게. 이 뒤의
   * `close()`는 아무것도 하지 않는다.
   */
  leave(): Promise<void>;
}

/** content script 답의 공통 모양. 시간 초과·받는 쪽 없음은 `{ ok: false, error }`로 온다. */
export interface PageAnswer {
  ok?: boolean;
  error?: string;
}

/**
 * 탭이 사이트 밖으로 옮겨 갔는지 보는 규칙(KID-355 QA: 1688 슬라이더 뒤 login.taobao.com 리다이렉트). 확장 권한 밖
 * 호스트에 주입하면 Chrome이 권한 오류로 실행을 죽인다 — 묻기 전과 주입 직전에 탭의 지금 주소를 이 규칙으로 본다.
 */
export interface PageGuard {
  /** 이 사이트가 읽는 호스트(확장 권한 안). */
  allows(url: URL): boolean;
  /** 사이트의 로그인 화면(운영자가 열려 있는 탭에서 로그인한다). */
  isLogin(url: URL): boolean;
  loginMessage: string;
}

/** 로그인 화면이면 `SITE_LOGIN_REQUIRED`, 사이트 밖 다른 주소면 `SITE_REQUEST_FAILED{reason:'unexpected_url'}`. */
export function checkPageUrl(guard: PageGuard, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeError(SITE_REQUEST_FAILED, '수집 탭의 주소를 읽지 못했습니다.', { status: null, reason: 'unexpected_url', url: value });
  }
  if (guard.isLogin(url)) throw new RuntimeError(SITE_LOGIN_REQUIRED, guard.loginMessage, { url: value });
  if (!guard.allows(url)) {
    throw new RuntimeError(SITE_REQUEST_FAILED, '수집 탭이 예상하지 못한 주소로 옮겨 갔습니다. 열려 있는 탭을 확인한 뒤 다시 수집해 주세요.',
      { status: null, reason: 'unexpected_url', url: value });
  }
}

/** 운영자가 그 탭에서 해야 할 일(GS샵 SMS 인증 시간 초과·보리보리 다운로드 비밀번호, KID-380) — 탭을 남기고 앞으로 가져온다. */
export const OPERATOR_ACTION_REQUIRED = 'OPERATOR_ACTION_REQUIRED' as const;

/** 사이트 밖으로 옮겨 간 탭(로그인·예상 밖 주소)이나 운영자 조치의 실패인가 — 그 탭은 닫지 않고 운영자에게 남긴다. */
export function leftForOperator(error: unknown): boolean {
  return isRuntimeError(error)
    && (error.code === SITE_LOGIN_REQUIRED || error.code === OPERATOR_ACTION_REQUIRED || error.details?.reason === 'unexpected_url');
}

/** 호스트가 그 도메인이거나 그 하위 도메인인가. */
export function hostWithin(url: URL, domains: readonly string[]): boolean {
  const host = url.hostname.toLowerCase();
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export interface InjectFiles {
  isolated: readonly string[];
  /** ISOLATED 다음에 MAIN world로 넣는 파일(페이지 변수를 읽는 브리지). */
  main?: readonly string[];
}

export interface TabPages {
  /** 백그라운드 탭을 새로 연다. `close()`가 닫는다. */
  open(url: string): Promise<TabPage>;
  /** 운영자가 연 탭을 그대로 쓴다. `close()`는 아무것도 하지 않는다. */
  attach(tabId: number): TabPage;
  /**
   * 주소 무늬(`https://host/*`)에 맞는 열린 탭을 찾아 `attach`한다(없으면 null). 세션이 탭에 묶인 사이트(롯데ON의 탭별
   * sessionStorage 토큰, KID-380)만 쓴다 — 그 탭의 세션으로 읽고, 운영자 탭이므로 닫지 않는다.
   */
  find(urlPattern: string): Promise<TabPage | null>;
  /** 브라우저 밖 fetch(서비스워커). 설명 본문처럼 탭 없이 읽을 때만 쓴다. */
  fetchText(url: string, init?: RequestInit): Promise<string | null>;
  /**
   * 이 확장이 연 탭을 운영자에게 남겼다고 적는다(KID-380 D8). 사이트(`key`)마다 하나만 — 먼저 남긴 다른 탭은 닫는다.
   * 서비스워커가 다시 뜨면 잊는다.
   */
  keep(key: string, page: TabPage): Promise<void>;
  /**
   * 그 사이트에 남긴 탭이 아직 열려 있고 운영자가 보고 있지 않으며 남길 때 주소나 로그인·빈 화면이면 이 확장이 연 탭으로
   * 돌려준다(없으면 null). 어느 쪽이든 기록은 비운다. 새 탭 대신 옮겨 쓴다.
   */
  reclaimKept(key: string): Promise<TabPage | null>;
  /**
   * 그 호스트(하위 도메인 포함)의 문서가 불러오기를 시작할 때(document_start) MAIN world에 알림 창 가드
   * (`DIALOG_GUARD_FILE`)를 거는 등록 content script를 이 실행 몫으로 등록한다(KID-380 D4). 로드 중 `alert`이 백그라운드
   * 탭을 멈추지 않게 주소를 옮기기 전에 건다. 돌려준 함수가 등록을 지운다(두 번 불러도 한 번). 등록이 안 되는 환경이면
   * 가드 없이 이어 간다.
   */
  guardDialogs(hosts: readonly string[]): Promise<() => Promise<void>>;
  /** 이 탭이 지금 실행이 쥔 수집 탭인가(이 런타임이 열었거나 다시 가져와 쓰는 중, 닫거나 운영자에게 남기기 전) — 실기기 R1. */
  isRunTab(tabId: number): boolean;
}

/** 불러오는 중 알림 창 가드 파일(MAIN world, document_start). */
export const DIALOG_GUARD_FILE = 'content/page-call/dialog-guard.js';
/** 가드의 ISOLATED 짝 — 수집 탭인지 런타임에 묻는다(실기기 R1). */
export const DIALOG_GUARD_BRIDGE_FILE = 'content/page-call/dialog-guard-bridge.js';
export const DIALOG_GUARD_RUN_TAB_ACTION = 'kiditem.dialogGuard.isRunTab';
/** 런타임 → 가드 짝: 이 탭을 운영자에게 넘겼다(`runTab: false`)·다시 쓴다(리뷰 2 SHOULD 2·3). */
export const DIALOG_GUARD_SET_RUN_TAB_ACTION = 'kiditem.dialogGuard.setRunTab';

/**
 * 가드 짝의 물음(`kiditem.dialogGuard.isRunTab`)에 답한다: 보낸 탭이 지금 실행이 쥔 수집 탭이면 `{runTab: true}`. 다른 메시지는
 * 받지 않는다(다른 수신자가 답한다). 입구가 한 번 건다.
 */
export function installDialogGuardAnswer(
  chromeApi: { runtime: { onMessage: { addListener(listener: (message: unknown, sender: { tab?: { id?: number } }, sendResponse: (answer: unknown) => void) => unknown): void } } },
  tabs: Pick<TabPages, 'isRunTab'>,
): void {
  chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || (message as { action?: unknown }).action !== DIALOG_GUARD_RUN_TAB_ACTION) return undefined;
    const tabId = sender.tab?.id;
    sendResponse({ runTab: typeof tabId === 'number' && tabs.isRunTab(tabId) });
    return undefined;
  });
}
const DIALOG_GUARD_ID_PREFIX = 'kiditem-dialog-guard-';

/**
 * 서비스워커가 다시 뜨면 지난 실행이 건 가드 등록이 남는다(해제 함수를 잃었다) — 입구가 뜰 때 이 확장의 가드 등록을 다
 * 지운다(리뷰 MUST 2). 던지지 않는다.
 */
export async function sweepDialogGuards(chromeApi: Partial<Pick<TabPageChrome, 'scripting'>> | undefined): Promise<void> {
  // 옛 워커의 가짜 chrome(테스트 하네스)엔 `scripting`이 없다 — 지울 게 없으면 조용히 끝낸다.
  const scripting = chromeApi?.scripting;
  if (!scripting?.getRegisteredContentScripts || !scripting.unregisterContentScripts) return;
  try {
    const ids = (await scripting.getRegisteredContentScripts())
      .map((script) => script.id)
      .filter((id) => id.startsWith(DIALOG_GUARD_ID_PREFIX));
    if (ids.length > 0) await scripting.unregisterContentScripts({ ids });
  } catch {
    // 지우지 못해도 다음 실행은 새 id로 건다.
  }
}

/** 웹 탭에 "토큰을 다시 보내 달라"는 이벤트(`kiditem:extension-auth-required`)를 띄우는 파일(KID-366). */
export const AUTH_REQUIRED_EVENT_FILE = 'content/page-call/auth-required-event.js';

/**
 * 그 환경의 KidItem 웹 탭(`urlPattern`)마다 재로그인 힌트 파일을 넣는다(옛 `environment-context.js` `notifyAuthRequired`).
 * 웹의 AuthProvider가 이벤트를 받아 `setAuthToken`을 다시 보낸다. 잠든·얼린 탭은 건너뛰고, 실패해도 던지지 않는다(힌트일 뿐).
 */
export async function requestWebAuth(
  chromeApi: {
    tabs: { query(query: { url: string }): Promise<Array<{ id?: number; discarded?: boolean; frozen?: boolean }>> };
    scripting: { executeScript(injection: { target: { tabId: number }; files: string[] }): Promise<unknown> };
  },
  urlPattern: string,
): Promise<void> {
  let tabs: Array<{ id?: number; discarded?: boolean; frozen?: boolean }>;
  try {
    tabs = await chromeApi.tabs.query({ url: urlPattern });
  } catch {
    return;
  }
  await Promise.all((Array.isArray(tabs) ? tabs : [])
    .filter((tab) => typeof tab.id === 'number' && tab.discarded !== true && tab.frozen !== true)
    .map((tab) => chromeApi.scripting.executeScript({ target: { tabId: tab.id as number }, files: [AUTH_REQUIRED_EVENT_FILE] }).catch(() => undefined)));
}

export const SITE_TAB_UNAVAILABLE = 'SITE_TAB_UNAVAILABLE' as const;

const OPERATOR_POLL_MS = 2_000;
const OPERATOR_WAIT_MAX_MS = 10 * 60_000;
const OPERATOR_REMIND_MS = 3 * 60_000;

/** 사이트가 운영자를 기다리는 까닭(수집기가 progress.attention으로 올린다). */
export interface SiteAttention {
  kind: 'verification';
  site: string;
  label: string;
}
export type AttentionListener = (attention: SiteAttention | null) => void | Promise<void>;

/**
 * 검증 화면에서 운영자를 기다린다(KID-355 QA): 알리고(`onAttention`), 탭이 검증 화면을 벗어날 때까지 기다린 뒤
 * 풀렸다고 알린다. 벗어나면 true — 사이트는 같은 대상을 다시 시도한다. 상한을 넘기면 false.
 */
export async function waitForOperator(
  page: TabPage,
  blocked: (url: string) => boolean | Promise<boolean>,
  attention: SiteAttention,
  onAttention?: AttentionListener,
): Promise<boolean> {
  await onAttention?.(attention);
  const cleared = await page.waitWhile(blocked, { onRemind: () => onAttention?.(attention) });
  if (cleared) await onAttention?.(null);
  return cleared;
}

/** `chrome.tabs`·`chrome.scripting`·`chrome.runtime`의 최소 모양(스펙은 이 경계만 가짜로 둔다). */
export interface TabPageChrome {
  tabs: {
    create(properties: { url: string; active: boolean }): Promise<{ id?: number }>;
    update(tabId: number, properties: { url?: string; active?: boolean }): Promise<unknown>;
    get(tabId: number): Promise<{ status?: string; url?: string; pendingUrl?: string; active?: boolean }>;
    query(query: { url: string }): Promise<Array<{ id?: number; url?: string; status?: string }>>;
    remove(tabId: number): Promise<void>;
    sendMessage(tabId: number, message: unknown, options?: { frameId?: number }): Promise<unknown>;
  };
  scripting: {
    executeScript(injection: {
      /** 맨 위 문서 · 모든 프레임 · 고른 프레임 가운데 하나(chrome 타입이 셋을 서로 배타로 둔다). */
      target: { tabId: number } | { tabId: number; allFrames: true } | { tabId: number; frameIds: number[] };
      files: string[];
      world?: 'ISOLATED' | 'MAIN';
    }): Promise<unknown>;
    /** 알림 창 가드 등록(KID-380 D4). 없는 환경(옛 스펙 가짜)이면 가드 없이 이어 간다. */
    registerContentScripts?(scripts: Array<{
      id: string;
      matches: string[];
      js: string[];
      world: 'MAIN' | 'ISOLATED';
      runAt: 'document_start';
      allFrames: boolean;
      persistAcrossSessions: boolean;
    }>): Promise<unknown>;
    unregisterContentScripts?(filter?: { ids?: string[] }): Promise<unknown>;
    getRegisteredContentScripts?(filter?: { ids?: string[] }): Promise<Array<{ id: string }>>;
  };
  runtime: {
    onMessage: {
      addListener(listener: (message: unknown, sender: { tab?: { id?: number } }) => void): void;
      removeListener(listener: (message: unknown, sender: { tab?: { id?: number } }) => void): void;
    };
    /** 확장 파일 주소(새 문서 스크립트로 등록할 파일을 읽는다). */
    getURL?(path: string): string;
  };
  /** 문서가 뜨기 전 스크립트·실제 입력(KID-256). 없는 환경이면 그 기능만 실패한다. */
  debugger?: {
    attach(target: { tabId: number }, version: string): Promise<void>;
    sendCommand(target: { tabId: number }, method: string, params?: Record<string, unknown>): Promise<unknown>;
    detach(target: { tabId: number }): Promise<void>;
  };
}

/** 실제 입력 부탁(쓰기 탭의 처리기 → 런타임). 편집 명령이어야 반응하는 칸(Wing 카테고리 검색)에 쓴다. */
export const TRUSTED_INPUT_ACTION = 'kiditem.write.insertText';

/**
 * 쓰기 탭 처리기의 실제 입력 부탁에 답한다(KID-256 — 옛 Wing `inputWingCategorySearch`). 이 런타임이 쥔 탭(`isRunTab`)에서 온
 * 짧은 한 줄 글자만 디버거 `Input.insertText`로 그 탭에 넣는다 — 다른 탭·운영자 탭·줄바꿈이 든 글자는 거절한다. 입구가 한 번 건다.
 */
export function installTrustedInputAnswer(
  chromeApi: Pick<TabPageChrome, 'debugger'> & { runtime: { onMessage: { addListener(listener: (message: unknown, sender: { tab?: { id?: number } }, sendResponse: (answer: unknown) => void) => unknown): void } } },
  tabs: Pick<TabPages, 'isRunTab'>,
): void {
  chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || (message as { action?: unknown }).action !== TRUSTED_INPUT_ACTION) return undefined;
    const value = (message as { value?: unknown }).value;
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number' || !tabs.isRunTab(tabId)) {
      sendResponse({ ok: false, error: '이 확장이 쓰는 탭이 아닙니다.' });
      return undefined;
    }
    if (typeof value !== 'string' || value.length === 0 || value.length > 100 || /[\r\n\0]/.test(value)) {
      sendResponse({ ok: false, error: '넣을 글자가 올바르지 않습니다.' });
      return undefined;
    }
    const api = chromeApi.debugger;
    if (!api) {
      sendResponse({ ok: false, error: '실제 입력을 쓸 수 없는 환경입니다.' });
      return undefined;
    }
    const target = { tabId };
    void (async () => {
      let attached = false;
      try {
        await api.attach(target, '1.3');
        attached = true;
        await api.sendCommand(target, 'Input.insertText', { text: value });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: (error as Error)?.message ?? String(error) });
      } finally {
        if (attached) await api.detach(target).catch(() => undefined);
      }
    })();
    return true;
  });
}

export interface TabPageDeps {
  chrome: TabPageChrome;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

const POLL_MS = 250;
/** 재사용 후보에서 빼는 주소(로그인·가입·인증 화면). */
const LOGIN_LIKE_URL = /\/[^/?#]*(?:login|signin|sign-in|auth)/i;
const MISSING_RECEIVER = /(?:receiving end|could not establish|message port|no listener)/i;

let dialogGuardSerial = 0;

export function createTabPages(deps: TabPageDeps): TabPages {
  /** 사이트마다 운영자에게 남긴 탭 하나와 남길 때의 주소(KID-380 D8). */
  const kept = new Map<string, { tabId: number; url: string }>();
  /** 지금 실행이 쥔 수집 탭(이 런타임이 열었거나 다시 가져온 탭). 닫거나 운영자에게 남기면 뺀다(실기기 R1). */
  const runTabs = new Set<number>();
  /** 탭을 운영자에게 넘긴다 — 수집 탭에서 빼고 그 탭의 가드 짝에 알려 진짜 창으로 돌린다(짝이 없으면 조용히 넘어간다). */
  async function handToOperator(tabId: number): Promise<void> {
    runTabs.delete(tabId);
    await deps.chrome.tabs.sendMessage(tabId, { action: DIALOG_GUARD_SET_RUN_TAB_ACTION, runTab: false }).catch(() => undefined);
  }
  /**
   * 남긴 탭을 이 확장이 다시 써도 되는가: 아직 열려 있고, 운영자가 보고 있지 않고(active 아님), 남길 때 주소나 로그인·빈 화면에
   * 머물러 있다. 운영자가 로그인해 다른 화면으로 옮긴 탭은 운영자 것이다(리뷰 SHOULD 3).
   */
  async function stillOurs(entry: { tabId: number; url: string }): Promise<boolean> {
    const tab = await deps.chrome.tabs.get(entry.tabId).catch(() => null);
    if (!tab || tab.active === true) return false;
    const url = tab.url ?? '';
    return url === entry.url || url === '' || url.startsWith('about:') || LOGIN_LIKE_URL.test(url);
  }
  function page(tabId: number, owned: boolean): TabPage {
    let closed = false;
    async function send<T extends PageAnswer>(message: Record<string, unknown>, timeoutMs: number, frameId?: number): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: 'timeout' } as T), timeoutMs);
      });
      const answer = (frameId === undefined ? deps.chrome.tabs.sendMessage(tabId, message) : deps.chrome.tabs.sendMessage(tabId, message, { frameId })).then(
        (response) => (response ?? { ok: false, error: 'empty_response' }) as T,
        (error: unknown) => ({ ok: false, error: MISSING_RECEIVER.test(String((error as Error)?.message ?? error)) ? 'content_script_missing' : String((error as Error)?.message ?? error) }) as T,
      );
      try {
        return await Promise.race([answer, timeout]);
      } finally {
        clearTimeout(timer);
      }
    }
    /** 확장 파일을 새 문서 스크립트로 등록하고 디버거로 옮긴다(등록은 이 탭에만, 옮긴 뒤 디버거를 뗀다). */
    async function navigateWithBootstrap(url: string, file: string): Promise<void> {
      const api = deps.chrome.debugger;
      const getURL = deps.chrome.runtime.getURL;
      if (!api || !getURL) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '페이지를 준비할 수 없는 환경입니다.', { url });
      const response = await deps.fetch(getURL(file));
      if (!response.ok) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '페이지 준비 파일을 읽지 못했습니다.', { url, file });
      const source = await response.text();
      const target = { tabId };
      let attached = false;
      try {
        await api.attach(target, '1.3');
        attached = true;
        await api.sendCommand(target, 'Page.enable');
        const script = await api.sendCommand(target, 'Page.addScriptToEvaluateOnNewDocument', { source }) as { identifier?: unknown } | undefined;
        if (typeof script?.identifier !== 'string') throw new Error('새 문서 스크립트를 등록하지 못했습니다.');
        const navigation = await api.sendCommand(target, 'Page.navigate', { url }) as { errorText?: string } | undefined;
        if (navigation?.errorText) throw new Error(navigation.errorText);
      } catch (error) {
        throw new RuntimeError(SITE_TAB_UNAVAILABLE, '페이지가 뜨기 전에 준비하지 못했습니다.', { url, reason: (error as Error)?.message ?? String(error) });
      } finally {
        if (attached) await api.detach(target).catch(() => undefined);
      }
    }
    return {
      tabId,
      async navigate(url, { timeoutMs, stopAt, continueOnTimeout = false, bootstrapFile }) {
        // 옮기기 전 문서의 주소. Chrome은 새 주소를 커밋할 때까지 pendingUrl에 두고 url은 옛 문서다 — 옛 로그인 문서에서
        // stopAt이 먼저 맞으면 새 화면이 뜨기 전에 옛 문서에 채우게 된다(리뷰 2 MUST 1).
        const before = (await deps.chrome.tabs.get(tabId).catch(() => null))?.url ?? null;
        // 이 런타임이 연 탭을 옮기면 다시 수집 탭이다(운영자 조치 뒤 이어 읽기) — 새 문서의 가드 짝이 묻는다.
        if (owned && !closed) runTabs.add(tabId);
        if (bootstrapFile) await navigateWithBootstrap(url, bootstrapFile);
        else await deps.chrome.tabs.update(tabId, { url });
        const deadline = deps.now() + timeoutMs;
        let last = url;
        // 주소를 바꾼 직후에는 옛 문서의 'complete'가 남아 있을 수 있어 한 번 쉬고 본다.
        await deps.sleep(POLL_MS);
        for (;;) {
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭이 닫혔습니다.', { tabId });
          last = tab.url || last;
          const committed = !tab.pendingUrl && tab.url !== undefined && tab.url !== before;
          if ((committed && stopAt?.(last)) || tab.status === 'complete') return last;
          if (deps.now() >= deadline) {
            if (continueOnTimeout) return last;
            throw new RuntimeError(SITE_TAB_UNAVAILABLE, '페이지를 여는 데 시간이 너무 오래 걸립니다.', { url });
          }
          await deps.sleep(POLL_MS);
        }
      },
      async waitWhile(blocked, { onRemind }) {
        const started = deps.now();
        let remindedAt = started;
        for (;;) {
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭이 닫혔습니다.', { tabId });
          if (!(await blocked(tab.url ?? ''))) return true;
          if (deps.now() - started >= OPERATOR_WAIT_MAX_MS) return false;
          if (deps.now() - remindedAt >= OPERATOR_REMIND_MS) {
            remindedAt = deps.now();
            await onRemind?.();
          }
          await deps.sleep(OPERATOR_POLL_MS);
        }
      },
      async focus() {
        // 운영자가 이 탭에서 할 일이 있다(GS샵 SMS 인증·운영자 조치) — 진짜 알림 창을 보게 넘긴다(리뷰 2 SHOULD 2).
        await handToOperator(tabId);
        await deps.chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
      },
      async currentUrl() {
        const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
        if (!tab?.url) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집할 탭을 찾지 못했습니다.', { tabId });
        return tab.url;
      },
      async ask<T extends PageAnswer>(message: Record<string, unknown>, { timeoutMs, inject, guard, frameId }: { timeoutMs: number; inject?: InjectFiles; guard?: PageGuard; frameId?: number }) {
        const checkHere = async () => {
          if (!guard) return;
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭이 닫혔습니다.', { tabId });
          checkPageUrl(guard, tab.url ?? '');
        };
        await checkHere();
        const first = await send<T>(message, timeoutMs, frameId);
        // 가드 짝(ISOLATED)만 있는 탭은 받는 쪽이 있어 "Receiving end does not exist" 대신 빈 답이 온다 — 주입 전의 빈 답은
        // 처리기가 없는 것과 같다(재QA 2 B1). 주입한 뒤의 빈 답은 그대로 오류다.
        if (!inject || !(isMissing(first) || isEmpty(first))) {
          if (isMissing(first) || isTimeout(first)) await checkHere();
          return first;
        }
        // 묻는 사이에 탭이 옮겨 갔을 수 있다(로그인 리다이렉트) — 주입 직전에 다시 본다.
        await checkHere();
        const target: { tabId: number } | { tabId: number; frameIds: number[] } = frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] };
        await deps.chrome.scripting.executeScript({ target, files: [...inject.isolated] });
        if (inject.main?.length) {
          await deps.sleep(300);
          await deps.chrome.scripting.executeScript({ target, files: [...inject.main], world: 'MAIN' });
        }
        await deps.sleep(500);
        const second = await send<T>(message, timeoutMs, frameId);
        // 읽는 사이 탭이 로그인·사이트 밖 화면으로 넘어갔으면(카카오 accounts 리다이렉트) 처리기가 없거나 답하지 못한다 —
        // 그 답을 실패로 넘기지 않고 주소 규칙으로 가른다(로그인이면 탭을 남긴다, 실기기 R4).
        if (isMissing(second) || isTimeout(second)) await checkHere();
        return second;
      },
      async frames<T>(files: readonly string[]) {
        const injected = await deps.chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: [...files] });
        return (Array.isArray(injected) ? injected : [])
          .filter((item): item is { frameId: number; result: T } =>
            typeof item?.frameId === 'number' && item.result !== undefined && item.result !== null)
          .map((item) => ({ frameId: item.frameId, result: item.result }));
      },
      listen(listener) {
        const handler = (message: unknown, sender: { tab?: { id?: number } }) => {
          if (sender.tab?.id !== tabId || !message || typeof message !== 'object') return;
          listener(message as Record<string, unknown>);
        };
        deps.chrome.runtime.onMessage.addListener(handler);
        return () => deps.chrome.runtime.onMessage.removeListener(handler);
      },
      async close() {
        if (!owned || closed) return;
        closed = true;
        runTabs.delete(tabId);
        await deps.chrome.tabs.remove(tabId).catch(() => undefined);
      },
      async leave() {
        closed = true;
        await handToOperator(tabId);
      },
    };
  }

  return {
    async open(url) {
      const created = await deps.chrome.tabs.create({ url, active: false });
      if (typeof created.id !== 'number') throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭을 열지 못했습니다.', { url });
      runTabs.add(created.id);
      return page(created.id, true);
    },
    attach: (tabId) => page(tabId, false),
    async find(urlPattern) {
      // 옛 borrowOpenTab과 같은 고르기: 다 그려진 탭을, 로그인·인증 화면이 아닌 것부터 — 로그인 탭에 자격을 채우지 않게.
      const candidates = (await deps.chrome.tabs.query({ url: urlPattern })).filter((tab) => typeof tab.id === 'number');
      const usable = candidates.filter((tab) => !LOGIN_LIKE_URL.test(tab.url ?? ''));
      const picked = usable.find((tab) => tab.status === 'complete') ?? usable[0] ?? null;
      return picked && typeof picked.id === 'number' ? page(picked.id, false) : null;
    },
    async keep(key, keptPage) {
      await handToOperator(keptPage.tabId);
      const prior = kept.get(key);
      const tab = await deps.chrome.tabs.get(keptPage.tabId).catch(() => null);
      if (!tab) {
        kept.delete(key);
      } else {
        kept.set(key, { tabId: keptPage.tabId, url: tab.url ?? '' });
      }
      // 먼저 남긴 탭은 아직 우리 것일 때만 닫는다(운영자가 로그인해 쓰는 탭은 두고 잊는다).
      if (prior && prior.tabId !== keptPage.tabId && (await stillOurs(prior))) {
        await deps.chrome.tabs.remove(prior.tabId).catch(() => undefined);
      }
    },
    async reclaimKept(key) {
      const entry = kept.get(key);
      if (!entry) return null;
      kept.delete(key);
      if (!(await stillOurs(entry))) return null;
      runTabs.add(entry.tabId);
      return page(entry.tabId, true);
    },
    isRunTab: (tabId) => runTabs.has(tabId),
    async guardDialogs(hosts) {
      const scripting = deps.chrome.scripting;
      dialogGuardSerial += 1;
      const id = `${DIALOG_GUARD_ID_PREFIX}${deps.now()}-${dialogGuardSerial}`;
      const matches = hosts.flatMap((host) => [`https://${host}/*`, `https://*.${host}/*`]);
      let registered = false;
      if (matches.length > 0 && scripting.registerContentScripts) {
        registered = await scripting.registerContentScripts([
          { id, matches, js: [DIALOG_GUARD_FILE], world: 'MAIN', runAt: 'document_start', allFrames: true, persistAcrossSessions: false },
          { id: `${id}-bridge`, matches, js: [DIALOG_GUARD_BRIDGE_FILE], world: 'ISOLATED', runAt: 'document_start', allFrames: true, persistAcrossSessions: false },
        ]).then(() => true, () => false);
      }
      return async () => {
        if (!registered) return;
        registered = false;
        await scripting.unregisterContentScripts?.({ ids: [id, `${id}-bridge`] }).catch(() => undefined);
      };
    },
    async fetchText(url, init) {
      try {
        const response = await deps.fetch(url, { credentials: 'include', redirect: 'error', ...init });
        return response.ok ? await response.text() : null;
      } catch {
        return null;
      }
    },
  };
}

function isEmpty(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === 'empty_response';
}

function isTimeout(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === 'timeout';
}

function isMissing(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === 'content_script_missing';
}
