import type { InjectFiles, PageAnswer, TabPage, TabPages } from './tab-page';

/** 스펙용 가짜 탭 묶음. 주소 이동·질문·주입·닫기를 기록하고, 질문의 답은 `answer`가 정한다. */
export function fakeTabPages(options: {
  landAt?: (url: string) => string;
  answer: (message: Record<string, unknown>, injected: boolean) => unknown;
  fetchText?: (url: string) => string | null;
  currentUrl?: string;
}) {
  const log: string[] = [];
  let injected = false;
  const listeners: Array<(message: Record<string, unknown>) => void> = [];
  function page(tabId: number, owned: boolean): TabPage {
    return {
      tabId,
      async navigate(url) {
        log.push(`navigate ${url}`);
        return options.landAt ? options.landAt(url) : url;
      },
      async currentUrl() {
        return options.currentUrl ?? 'about:blank';
      },
      async ask<T extends PageAnswer>(message: Record<string, unknown>, { inject }: { timeoutMs: number; inject?: InjectFiles }) {
        log.push(`ask ${String(message.type)}`);
        let answer = options.answer(message, injected);
        if (inject && (answer as { error?: string })?.error === 'content_script_missing') {
          injected = true;
          log.push(`inject ${[...inject.isolated, ...(inject.main ?? [])].join(',')}`);
          log.push(`ask ${String(message.type)}`);
          answer = options.answer(message, injected);
        }
        return answer as T;
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
    async fetchText(url) {
      log.push(`fetch ${url}`);
      return options.fetchText?.(url) ?? null;
    },
  };
  return { tabs, log, emit: (message: Record<string, unknown>) => listeners.slice().forEach((listener) => listener(message)) };
}
