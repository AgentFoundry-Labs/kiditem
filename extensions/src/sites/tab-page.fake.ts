import { checkPageUrl, type InjectFiles, type PageAnswer, type PageGuard, type TabPage, type TabPages } from './tab-page';

/** 스펙용 가짜 탭 묶음. 주소 이동·질문·주입·닫기를 기록하고, 질문의 답은 `answer`가 정한다. */
export function fakeTabPages(options: {
  landAt?: (url: string) => string;
  answer: (message: Record<string, unknown>, injected: boolean) => unknown;
  fetchText?: (url: string) => string | null;
  /** `find(urlPattern)`이 돌려줄 열린 탭 id(없으면 null). */
  existingTab?: (urlPattern: string) => number | null;
  currentUrl?: string;
  /** 추출하는 사이에 탭이 옮겨 간 주소(예: 슬라이더 뒤 로그인 리다이렉트). 주입 직전에 탭이 이 주소에 있다. */
  urlBeforeInject?: string;
  /** 운영자가 검증을 통과하는가(`waitWhile`이 true). 없으면 상한까지 기다리다 false. */
  verificationClears?: boolean;
  /** 모든 프레임에 넣은 파일의 프레임별 값(`frames`). */
  frames?: (files: readonly string[], call: number, url: string) => Array<{ frameId: number; result: unknown }>;
}) {
  const log: string[] = [];
  let injected = false;
  const listeners: Array<(message: Record<string, unknown>) => void> = [];
  let current: string | null = null;
  let frameCalls = 0;
  function page(tabId: number, owned: boolean): TabPage {
    return {
      tabId,
      async navigate(url, navigateOptions) {
        // 끝까지 안 그려져도 이어 가는 사이트(1688·TikTok)는 표시를 남긴다.
        log.push(`navigate ${url}${navigateOptions?.continueOnTimeout ? ' (continue on timeout)' : ''}`);
        current = options.landAt ? options.landAt(url) : url;
        return current;
      },
      async waitWhile(_blocked, waitOptions) {
        log.push('wait for operator');
        await waitOptions.onRemind?.();
        return options.verificationClears === true;
      },
      async currentUrl() {
        return options.currentUrl ?? current ?? 'about:blank';
      },
      async ask<T extends PageAnswer>(message: Record<string, unknown>, { inject, guard, frameId }: { timeoutMs: number; inject?: InjectFiles; guard?: PageGuard; frameId?: number }) {
        const here = () => current ?? options.currentUrl ?? 'about:blank';
        if (guard) checkPageUrl(guard, here());
        log.push(`ask ${String(message.type)}${frameId !== undefined ? ` frame ${frameId}` : ''}`);
        let answer = options.answer(message, injected);
        if (inject && (answer as { error?: string })?.error === 'content_script_missing') {
          if (options.urlBeforeInject) current = options.urlBeforeInject;
          if (guard) checkPageUrl(guard, here());
          injected = true;
          log.push(`inject ${[...inject.isolated, ...(inject.main ?? [])].join(',')}`);
          log.push(`ask ${String(message.type)}${frameId !== undefined ? ` frame ${frameId}` : ''}`);
          answer = options.answer(message, injected);
        }
        return answer as T;
      },
      async frames<T>(files: readonly string[]) {
        frameCalls += 1;
        log.push(`frames ${files.join(',')}`);
        return (options.frames?.(files, frameCalls, current ?? options.currentUrl ?? 'about:blank') ?? []) as Array<{ frameId: number; result: T }>;
      },
      listen(listener) {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
      async close() {
        log.push(owned ? `close ${tabId}` : `keep ${tabId}`);
      },
    };
  }
  const tabs: TabPages = {
    async open(url) {
      log.push(`open ${url}`);
      return page(7, true);
    },
    attach: (tabId) => page(tabId, false),
    async find(urlPattern) {
      log.push(`find ${urlPattern}`);
      const tabId = options.existingTab?.(urlPattern) ?? null;
      return tabId === null ? null : page(tabId, false);
    },
    async fetchText(url) {
      log.push(`fetch ${url}`);
      return options.fetchText?.(url) ?? null;
    },
  };
  return { tabs, log, emit: (message: Record<string, unknown>) => listeners.slice().forEach((listener) => listener(message)) };
}
