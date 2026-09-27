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
   */
  navigate(url: string, options: { timeoutMs: number; stopAt?: (url: string) => boolean; continueOnTimeout?: boolean }): Promise<string>;
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
}

/** 불러오는 중 알림 창 가드 파일(MAIN world, document_start). */
export const DIALOG_GUARD_FILE = 'content/page-call/dialog-guard.js';
const DIALOG_GUARD_ID_PREFIX = 'kiditem-dialog-guard-';

/**
 * 서비스워커가 다시 뜨면 지난 실행이 건 가드 등록이 남는다(해제 함수를 잃었다) — 입구가 뜰 때 이 확장의 가드 등록을 다
 * 지운다(리뷰 MUST 2). 던지지 않는다.
 */
export async function sweepDialogGuards(chromeApi: Pick<TabPageChrome, 'scripting'>): Promise<void> {
  const scripting = chromeApi.scripting;
  if (!scripting.getRegisteredContentScripts || !scripting.unregisterContentScripts) return;
  try {
    const ids = (await scripting.getRegisteredContentScripts())
      .map((script) => script.id)
      .filter((id) => id.startsWith(DIALOG_GUARD_ID_PREFIX));
    if (ids.length > 0) await scripting.unregisterContentScripts({ ids });
  } catch {
    // 지우지 못해도 다음 실행은 새 id로 건다.
  }
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
    get(tabId: number): Promise<{ status?: string; url?: string; active?: boolean }>;
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
      world: 'MAIN';
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
  };
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
    return {
      tabId,
      async navigate(url, { timeoutMs, stopAt, continueOnTimeout = false }) {
        await deps.chrome.tabs.update(tabId, { url });
        const deadline = deps.now() + timeoutMs;
        let last = url;
        // 주소를 바꾼 직후에는 옛 문서의 'complete'가 남아 있을 수 있어 한 번 쉬고 본다.
        await deps.sleep(POLL_MS);
        for (;;) {
          const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
          if (!tab) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭이 닫혔습니다.', { tabId });
          last = tab.url || last;
          if (stopAt?.(last) || tab.status === 'complete') return last;
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
        if (!inject || !isMissing(first)) return first;
        // 묻는 사이에 탭이 옮겨 갔을 수 있다(로그인 리다이렉트) — 주입 직전에 다시 본다.
        await checkHere();
        const target: { tabId: number } | { tabId: number; frameIds: number[] } = frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] };
        await deps.chrome.scripting.executeScript({ target, files: [...inject.isolated] });
        if (inject.main?.length) {
          await deps.sleep(300);
          await deps.chrome.scripting.executeScript({ target, files: [...inject.main], world: 'MAIN' });
        }
        await deps.sleep(500);
        return send<T>(message, timeoutMs, frameId);
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
        await deps.chrome.tabs.remove(tabId).catch(() => undefined);
      },
    };
  }

  return {
    async open(url) {
      const created = await deps.chrome.tabs.create({ url, active: false });
      if (typeof created.id !== 'number') throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집 탭을 열지 못했습니다.', { url });
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
      return (await stillOurs(entry)) ? page(entry.tabId, true) : null;
    },
    async guardDialogs(hosts) {
      const scripting = deps.chrome.scripting;
      dialogGuardSerial += 1;
      const id = `${DIALOG_GUARD_ID_PREFIX}${deps.now()}-${dialogGuardSerial}`;
      const matches = hosts.flatMap((host) => [`https://${host}/*`, `https://*.${host}/*`]);
      let registered = false;
      if (matches.length > 0 && scripting.registerContentScripts) {
        registered = await scripting.registerContentScripts([
          { id, matches, js: [DIALOG_GUARD_FILE], world: 'MAIN', runAt: 'document_start', allFrames: true, persistAcrossSessions: false },
        ]).then(() => true, () => false);
      }
      return async () => {
        if (!registered) return;
        registered = false;
        await scripting.unregisterContentScripts?.({ ids: [id] }).catch(() => undefined);
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

function isMissing(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { error?: unknown }).error === 'content_script_missing';
}
