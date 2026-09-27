import { checkPageUrl, type InjectFiles, type PageAnswer, type PageGuard, type TabPage, type TabPages } from './tab-page';

/** 스펙용 가짜 탭 묶음. 주소 이동·질문·주입·닫기를 기록하고, 질문의 답은 `answer`가 정한다. */
export function fakeTabPages(options: {
  landAt?: (url: string) => string;
  /** 질문의 답. `frameId`는 프레임을 골라 물었을 때만(모든 프레임 몰). */
  answer: (message: Record<string, unknown>, injected: boolean, frameId?: number) => unknown;
  fetchText?: (url: string) => string | null;
  /** `find(urlPattern)`이 돌려줄 열린 탭 id(없으면 null). */
  existingTab?: (urlPattern: string) => number | null;
  currentUrl?: string;
  /** 추출하는 사이에 탭이 옮겨 간 주소(예: 슬라이더 뒤 로그인 리다이렉트). 주입 직전에 탭이 이 주소에 있다. */
  urlBeforeInject?: string;
  /** 운영자가 검증을 통과하는가(`waitWhile`이 true). 없으면 상한까지 기다리다 false. */
  verificationClears?: boolean;
  /**
   * 기다리는 동안 탭이 차례로 있는 주소(KID-380). 주소마다 `blocked`를 물어 false면 거기서 풀린다 — 화면을 살피는
   * `blocked`(GS샵 SMS 벽)를 스펙이 돌린다. 다 지나도 막혀 있으면 `verificationClears`로 끝난다.
   */
  waitUrls?: readonly string[];
  /** 모든 프레임에 넣은 파일의 프레임별 값(`frames`). */
  frames?: (files: readonly string[], call: number, url: string) => Array<{ frameId: number; result: unknown }>;
  /** 알림 창 가드 걸기·풀기(KID-380 D4)와 남긴 탭 적기·다시 쓰기(D8)도 `log`에 적는다. 없으면 `guards`에만 적는다(탭 순서만 보는 스펙). */
  logBookkeeping?: boolean;
}) {
  const log: string[] = [];
  const guards: string[] = [];
  const stops: string[] = [];
  const guardLog = (line: string) => {
    guards.push(line);
    if (options.logBookkeeping) log.push(line);
  };
  let injected = false;
  const listeners: Array<(message: Record<string, unknown>) => void> = [];
  let current: string | null = null;
  let frameCalls = 0;
  const kept = new Map<string, number>();
  function page(tabId: number, owned: boolean): TabPage {
    return {
      tabId,
      async navigate(url, navigateOptions) {
        // 끝까지 안 그려져도 이어 가는 사이트(1688·TikTok)는 표시를 남긴다.
        log.push(`navigate ${url}${navigateOptions?.continueOnTimeout ? ' (continue on timeout)' : ''}${navigateOptions?.bootstrapFile ? ` (bootstrap ${navigateOptions.bootstrapFile})` : ''}`);
        current = options.landAt ? options.landAt(url) : url;
        // 다 그려지기를 기다리지 않고 멈출 주소(로그인 화면 등)에 닿았는지 적는다.
        if (navigateOptions?.stopAt?.(current)) stops.push(current);
        return current;
      },
      async waitWhile(blocked, waitOptions) {
        log.push('wait for operator');
        await waitOptions.onRemind?.();
        for (const url of options.waitUrls ?? []) {
          current = url;
          if (!(await blocked(url))) return true;
        }
        return options.verificationClears === true;
      },
      async focus() {
        log.push(`focus ${tabId}`);
      },
      async currentUrl() {
        return options.currentUrl ?? current ?? 'about:blank';
      },
      async ask<T extends PageAnswer>(message: Record<string, unknown>, { inject, guard, frameId }: { timeoutMs: number; inject?: InjectFiles; guard?: PageGuard; frameId?: number }) {
        const here = () => current ?? options.currentUrl ?? 'about:blank';
        if (guard) checkPageUrl(guard, here());
        log.push(`ask ${String(message.type)}${frameId !== undefined ? ` frame ${frameId}` : ''}`);
        let answer = options.answer(message, injected, frameId);
        if (inject && (answer as { error?: string })?.error === 'content_script_missing') {
          if (options.urlBeforeInject) current = options.urlBeforeInject;
          if (guard) checkPageUrl(guard, here());
          injected = true;
          log.push(`inject ${[...inject.isolated, ...(inject.main ?? [])].join(',')}`);
          log.push(`ask ${String(message.type)}${frameId !== undefined ? ` frame ${frameId}` : ''}`);
          answer = options.answer(message, injected, frameId);
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
      async leave() {
        log.push(`leave ${tabId}`);
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
    async keep(key, kept_) {
      guardLog(`keep for ${key} ${kept_.tabId}`);
      kept.set(key, kept_.tabId);
    },
    async reclaimKept(key) {
      const tabId = kept.get(key);
      if (tabId === undefined) return null;
      kept.delete(key);
      guardLog(`reclaim ${key} ${tabId}`);
      return page(tabId, true);
    },
    isRunTab: () => false,
    async guardDialogs(hosts) {
      guardLog(`guard dialogs ${hosts.join(',')}`);
      return async () => {
        guardLog(`unguard dialogs ${hosts.join(',')}`);
      };
    },
    async fetchText(url) {
      log.push(`fetch ${url}`);
      return options.fetchText?.(url) ?? null;
    },
  };
  return { tabs, log, guards, stops, emit: (message: Record<string, unknown>) => listeners.slice().forEach((listener) => listener(message)) };
}
