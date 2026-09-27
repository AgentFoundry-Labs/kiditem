import { vi } from 'vitest';
import { normalizeForm, type MallFormSpec } from './form';
import { fillPayload } from './form-register';

/**
 * 스펙용 — 몰 쓰기 페이지 처리기(`content/page-call/form-fill.js`와 전용 몰 `<mall>-register.js`)를 실제 파일 그대로 jsdom
 * 문서(스펙이 `// @vitest-environment jsdom`)에서 돌린다. 파일 원문은 스펙이 `?raw`로 넘긴다(층 밖 import는 `src/` 바로 아래
 * 스펙만 한다 — `check:extension-runtime-layers`): 알림 창 가드, 채우기 공용 파일, 전용 몰 파일 순서. 가짜는 페이지 경계(몰 화면 DOM)뿐이다. 기다림은 가짜 시계로 바로
 * 지나간다(`runPageCall`). 확장 tsconfig에는 DOM 타입이 없어 문서는 느슨한 모양으로 본다.
 */
export type Dom = { document: any; window: any };
export const dom = globalThis as unknown as Dom;

type PageCall = (args: unknown) => Promise<Record<string, any>>;

/** 저장·등록 버튼 글자(누르면 몰에 올라가거나 임시저장된다). */
const SAVE_WORDS = /^(?:등록|저장|임시저장|저장하기|등록하기|상품등록|상품 등록|전체저장|임시 저장|상품정보 임시저장|판매요청)$/;

export interface WritePage {
  calls: Record<string, PageCall>;
  /** 누른 저장·등록 버튼 글자와 보낸 폼. 잠금 스펙이 비었는지 본다. */
  saves: string[];
}

/** 몰 화면을 그리고 가드·채우기 처리기(와 전용 파일)를 넣는다. 앞 스펙의 처리기·가드 표시는 지운다. */
export function loadWritePage(html: string, sources: readonly string[], options: { path?: string } = {}): WritePage {
  const { window, document } = dom;
  // 문서 주소(같은 출처 안의 경로) — 폼 프레임 주소를 보는 몰(떠리몰)은 그 경로여야 채운다.
  window.history.replaceState({}, '', options.path ?? '/');
  for (const key of ['__kiditemPageCalls', '__kiditemDialogGuard', '__kiditemDialogs', '__kiditemWriteTab', '__kiditemWriteDialogs', '__kiditemSaveDialogs']) delete window[key];
  try {
    window.sessionStorage?.clear();
  } catch {
    // 저장소 없는 문서.
  }
  document.documentElement.innerHTML = /<body[\s>]/i.test(html) ? html.replace(/^[\s\S]*?<html[^>]*>|<\/html>[\s\S]*$/gi, '') : `<head></head><body>${html}</body>`;
  if (!window.CSS?.escape) window.CSS = { ...(window.CSS ?? {}), escape: (value: string) => String(value).replace(/[^a-zA-Z0-9_ -￿-]/g, (char) => `\\${char}`) };
  if (typeof window.DataTransfer !== 'function') {
    window.DataTransfer = class {
      private list: unknown[] = [];
      items = { add: (file: unknown) => this.list.push(file) };
      get files() {
        return this.list;
      }
    };
  }
  const saves: string[] = [];
  document.addEventListener('click', (event: any) => {
    const target = event.target?.closest?.('button, a, input[type=button], input[type=submit]');
    const text = String(target?.textContent || target?.value || '').replace(/\s+/g, ' ').trim();
    if (target && SAVE_WORDS.test(text)) saves.push(`click ${text}`);
  }, true);
  document.addEventListener('submit', (event: any) => {
    saves.push(`submit ${event.target?.getAttribute?.('name') ?? event.target?.id ?? 'form'}`);
    event.preventDefault();
  }, true);
  const proto = window.HTMLFormElement.prototype;
  proto.submit = function submit(this: any) {
    saves.push(`form.submit ${this.getAttribute('name') ?? this.id ?? 'form'}`);
  };
  proto.requestSubmit = function requestSubmit(this: any) {
    saves.push(`form.requestSubmit ${this.getAttribute('name') ?? this.id ?? 'form'}`);
  };
  for (const source of sources) new Function(source)();
  return { calls: window.__kiditemPageCalls as Record<string, PageCall>, saves };
}

/** 페이지 호출 하나를 가짜 시계로 끝까지 돌린다(처리기의 기다림·재시도가 바로 지나간다). */
export async function runPageCall(page: WritePage, call: string, args: unknown): Promise<Record<string, any>> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  try {
    const handler = page.calls[call];
    if (!handler) throw new Error(`no page call ${call}`);
    const running = handler(structuredClone(args));
    let settled = false;
    void running.finally(() => {
      settled = true;
    }).catch(() => undefined);
    for (let round = 0; round < 2_000 && !settled; round += 1) await vi.advanceTimersByTimeAsync(1_000);
    return JSON.parse(JSON.stringify(await running)) as Record<string, any>;
  } finally {
    vi.useRealTimers();
  }
}

/** 명세와 폼 지시로 페이지 처리기 인자를 만든다(사진·상세 없이 — 서비스워커 준비는 `form-register.spec.ts`가 본다). */
export function payloadFor(spec: MallFormSpec, form: Record<string, unknown>): { call: string; payload: Record<string, unknown> } {
  const normalized = normalizeForm(spec, form);
  const { call, payload } = fillPayload(spec, { form: normalized, images: [], imageGroups: {}, repImage: null, detailImage: null, detailHtml: '', warnings: [] });
  return { call, payload };
}
