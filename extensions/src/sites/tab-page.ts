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
  waitWhile(blocked: (url: string) => boolean, options: { onRemind?(): void | Promise<void> }): Promise<boolean>;
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

/** 사이트 밖으로 옮겨 간 탭(로그인·예상 밖 주소)의 실패인가 — 그 탭은 닫지 않고 운영자에게 남긴다. */
export function leftForOperator(error: unknown): boolean {
  return isRuntimeError(error) && (error.code === SITE_LOGIN_REQUIRED || error.details?.reason === 'unexpected_url');
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
  blocked: (url: string) => boolean,
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
    update(tabId: number, properties: { url: string }): Promise<unknown>;
    get(tabId: number): Promise<{ status?: string; url?: string }>;
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
const LOGIN_LIKE_URL = /\/(?:login|signin|sign-in|auth)(?:[/?#.]|$)/i;
const MISSING_RECEIVER = /(?:receiving end|could not establish|message port|no listener)/i;

export function createTabPages(deps: TabPageDeps): TabPages {
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
          if (!blocked(tab.url ?? '')) return true;
          if (deps.now() - started >= OPERATOR_WAIT_MAX_MS) return false;
          if (deps.now() - remindedAt >= OPERATOR_REMIND_MS) {
            remindedAt = deps.now();
            await onRemind?.();
          }
          await deps.sleep(OPERATOR_POLL_MS);
        }
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
