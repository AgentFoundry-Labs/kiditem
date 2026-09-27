import { fakeTabPages } from '../tab-page.fake';
import type { SiteLease } from '../registry';
import {
  availabilityContext,
  mallAvailabilityFor,
  readMallAvailability,
  sendMallAvailability,
  sendMallPrice,
  type AvailabilityContext,
} from './availability';
import type { Fetch } from './images';

/**
 * 스펙용 — 몰 판매 상태 쓰기·읽기(`sites/<mall>/availability.ts`)를 가짜 탭에서 돌린다(옛 `mall-availability-send.test.mjs`의
 * `create({chrome, fetch, sleep})` 자리). 화면 안 요청은 둘 중 하나로 답한다: `handlers`(요청 이름 → 답, 옛 스펙이
 * `func.name`으로 흉내 내던 것) 또는 실제 페이지 파일(`sources`, 스펙이 `?raw`로 넘긴다)을 `page` 전역(fetch·DOMParser·location…)
 * 위에서 돌린 것. 기다림은 기록만 하고 바로 지나간다.
 */
export interface AvailabilityHarnessOptions {
  mallKey: string;
  /** 요청 이름(`requestOnPage` 등, `availability.` 앞머리 없이) → 답. 없으면 페이지 파일의 처리기를 돌린다. */
  handlers?: Record<string, (...args: any[]) => unknown>;
  /** 페이지 파일 원문(ISOLATED `mall-availability.js`, MAIN `mall-availability-main.js`). */
  sources?: readonly string[];
  /** 페이지 파일이 쓰는 화면 전역. */
  page?: Record<string, unknown>;
  /** 서비스워커의 fetch(도매꾹·온채널처럼 화면 없이 보내는 몰). */
  fetch?: Fetch;
  /** 이미 열린 그 몰 탭 id(없으면 null — 새 탭을 뒤에서 연다). */
  existingTab?: (urlPattern: string) => number | null;
  landAt?: (url: string) => string;
  currentUrl?: string;
  lease?: SiteLease;
}

export function availabilityHarness(options: AvailabilityHarnessOptions) {
  const module = mallAvailabilityFor(options.mallKey);
  if (!module) throw new Error(`no availability module: ${options.mallKey}`);
  const calls: Array<{ name: string; args: any[] }> = [];
  const sleeps: number[] = [];
  const registry = loadPageCalls(options.sources ?? [], options.page ?? {});
  const fake = fakeTabPages({
    ...(options.landAt ? { landAt: options.landAt } : {}),
    ...(options.existingTab ? { existingTab: options.existingTab } : {}),
    ...(options.currentUrl ? { currentUrl: options.currentUrl } : {}),
    answer: (message) => {
      const call = String(message.call ?? '');
      const name = call.replace(/^availability\./, '');
      const args = Array.isArray(message.args) ? (message.args as any[]) : [];
      calls.push({ name, args });
      const handler = options.handlers?.[name];
      if (handler) return Promise.resolve(handler(...args)).then((value) => ({ ok: true, value }));
      const own = registry[call];
      if (!own) return { ok: false, error: `no handler ${call}` };
      return Promise.resolve(own(args)).then((value) => ({ ok: true, value }));
    },
  });
  const deps = {
    tabs: fake.tabs,
    fetch: options.fetch ?? (async () => {
      throw new Error('서비스워커에서 직접 부르지 않는다');
    }),
    now: () => 0,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
  const context: AvailabilityContext = availabilityContext(module, deps as never, options.lease ?? { credentials: null } as never);
  const api = {
    send: (msg: { codes: string[]; resume?: boolean; options?: Record<string, string[]> | null; expectedProviderAccountId?: string | null }) =>
      sendMallAvailability(module, context, { codes: msg.codes, resume: msg.resume === true, options: msg.options ?? null, expectedProviderAccountId: msg.expectedProviderAccountId ?? null }),
    read: (msg: { codes: string[] }) => readMallAvailability(module, context, msg.codes),
    sendPrice: (msg: { items: Array<{ code: string; price: number; ifPrice?: number | null }> }) => sendMallPrice(module, context, msg.items),
  };
  return { api, module, context, calls, sleeps, log: fake.log, guards: fake.guards };
}

/**
 * 페이지 파일을 `page` 전역 위에서 돌려 처리기 표를 얻는다(ISOLATED·MAIN 둘 다 한 표). 화면 전역은 함수 인자로 넘긴다 — 파일의
 * `fetch`·`location`·`globalThis`가 그 값을 본다.
 */
function loadPageCalls(sources: readonly string[], page: Record<string, unknown>): Record<string, (args: unknown) => unknown> {
  if (sources.length === 0) return {};
  const scope: Record<string, unknown> = { ...page };
  scope.globalThis = scope;
  scope.window = scope;
  scope.self = scope;
  const names = Object.keys(scope);
  for (const source of sources) new Function(...names, source)(...names.map((name) => scope[name]));
  return {
    ...(scope.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => unknown> | undefined),
    ...(scope.__kiditemPageCalls as Record<string, (args: unknown) => unknown> | undefined),
  };
}
