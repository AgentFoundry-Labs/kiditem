import { RuntimeError } from '../core/errors';

/**
 * 사이트가 DOM을 읽어야 할 때 쓰는 탭 한 장(KID-360). 사이트는 탭을 열고(백그라운드), 주소를 옮기고, 다 그려질 때까지
 * 기다리고, 그 탭의 content script에 메시지를 보낸다. content script가 아직 없으면 파일을 주입하고 다시 보낸다
 * (`func.toString()` 주입은 쓰지 않는다 — README). 서버·실행은 모른다.
 */
export interface TabPage {
  readonly tabId: number;
  /** 주소를 옮기고 다 그려질 때까지(또는 막힘 주소가 될 때까지) 기다린다. 마지막 주소를 돌려준다. */
  navigate(url: string, options: { timeoutMs: number; stopAt?: (url: string) => boolean }): Promise<string>;
  /** 지금 탭 주소를 기다리지 않고 읽는다(운영자 탭). */
  currentUrl(): Promise<string>;
  /**
   * content script에 메시지를 보내고 답을 기다린다. 받는 쪽이 없으면 `inject`의 파일(ISOLATED·MAIN)을 주입하고
   * 한 번 더 보낸다. 시간이 지나면 `{ ok: false, error: 'timeout' }`.
   */
  ask<T extends PageAnswer>(message: Record<string, unknown>, options: { timeoutMs: number; inject?: InjectFiles }): Promise<T>;
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
  /** 브라우저 밖 fetch(서비스워커). 설명 본문처럼 탭 없이 읽을 때만 쓴다. */
  fetchText(url: string, init?: RequestInit): Promise<string | null>;
}

export const SITE_TAB_UNAVAILABLE = 'SITE_TAB_UNAVAILABLE' as const;

/** `chrome.tabs`·`chrome.scripting`·`chrome.runtime`의 최소 모양(스펙은 이 경계만 가짜로 둔다). */
export interface TabPageChrome {
  tabs: {
    create(properties: { url: string; active: boolean }): Promise<{ id?: number }>;
    update(tabId: number, properties: { url: string }): Promise<unknown>;
    get(tabId: number): Promise<{ status?: string; url?: string }>;
    remove(tabId: number): Promise<void>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
  scripting: {
    executeScript(injection: { target: { tabId: number }; files: string[]; world?: 'ISOLATED' | 'MAIN' }): Promise<unknown>;
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
const MISSING_RECEIVER = /(?:receiving end|could not establish|message port|no listener)/i;

export function createTabPages(deps: TabPageDeps): TabPages {
  function page(tabId: number, owned: boolean): TabPage {
    let closed = false;
    async function send<T extends PageAnswer>(message: Record<string, unknown>, timeoutMs: number): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve({ ok: false, error: 'timeout' } as T), timeoutMs);
      });
      const answer = deps.chrome.tabs.sendMessage(tabId, message).then(
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
      async navigate(url, { timeoutMs, stopAt }) {
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
            throw new RuntimeError(SITE_TAB_UNAVAILABLE, '페이지를 여는 데 시간이 너무 오래 걸립니다.', { url });
          }
          await deps.sleep(POLL_MS);
        }
      },
      async currentUrl() {
        const tab = await deps.chrome.tabs.get(tabId).catch(() => null);
        if (!tab?.url) throw new RuntimeError(SITE_TAB_UNAVAILABLE, '수집할 탭을 찾지 못했습니다.', { tabId });
        return tab.url;
      },
      async ask<T extends PageAnswer>(message: Record<string, unknown>, { timeoutMs, inject }: { timeoutMs: number; inject?: InjectFiles }) {
        const first = await send<T>(message, timeoutMs);
        if (!inject || !isMissing(first)) return first;
        await deps.chrome.scripting.executeScript({ target: { tabId }, files: [...inject.isolated] });
        if (inject.main?.length) {
          await deps.sleep(300);
          await deps.chrome.scripting.executeScript({ target: { tabId }, files: [...inject.main], world: 'MAIN' });
        }
        await deps.sleep(500);
        return send<T>(message, timeoutMs);
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
