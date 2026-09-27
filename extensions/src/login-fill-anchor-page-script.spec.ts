// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fillSource from '../kiditem-os/content/page-call/login-fill.js?raw';

// 로그인 폼 채우기(ISOLATED, KID-377)를 실제 파일 그대로 jsdom 화면에 돌린다(KID-380 D9). 롯데ON 판매자센터는 `<form>` 없는
// WebSquare 화면이고 로그인 버튼이 `<a href="javascript:void(null)">로그인</a>`이다 — 그 앵커를 그냥 누르면 확장 world에서
// `javascript:` 주소로 가려다 CSP 오류가 난다. 화면의 클릭 처리기는 돌게 하고 주소 이동만 막아야 한다.
const dom = globalThis as unknown as {
  document: { body: { innerHTML: string }; getElementById(id: string): EventTargetLike | null; querySelector(selector: string): EventTargetLike | null };
  window: unknown;
  Element: { prototype: Record<string, unknown> };
  Event: unknown;
  Node: unknown;
  KeyboardEvent: unknown;
};
type EventTargetLike = { addEventListener(type: string, listener: (event: { defaultPrevented: boolean; preventDefault(): void }) => void): void };

// jsdom은 배치를 하지 않아 크기가 0이다 — 보이는 칸으로 보게 한다.
dom.Element.prototype.getBoundingClientRect = () => ({ width: 120, height: 30 });

function fill(html: string) {
  dom.document.body.innerHTML = html;
  const isolated: Record<string, unknown> = {};
  new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
    fillSource, dom.document, dom.window, isolated, dom.Event, dom.Node, dom.KeyboardEvent,
  );
  const calls = isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>;
  return calls['login.fill']!({ values: { loginId: 'fake-id', password: 'fake-password' } });
}

const INPUTS = '<input type="text" id="mf_ibx_userId" title="사용자ID"><input type="password" id="mf_sct_pwd" title="비밀번호">';

describe('login-fill.js — javascript: 앵커 로그인 버튼(KID-380 D9)', () => {
  it('폼이 없는 화면의 javascript: 앵커는 클릭 처리기는 돌리고 주소 이동은 막는다', () => {
    const seen: boolean[] = [];
    dom.document.body.innerHTML = `${INPUTS}<a href="javascript:void(null)" id="mf_btn_login">로그인</a>`;
    // 화면(WebSquare)의 클릭 처리기 — 기본 동작(주소 이동)이 막혔는지 본다.
    let lastEvent: { defaultPrevented: boolean } | null = null;
    const attach = () => dom.document.getElementById('mf_btn_login')!.addEventListener('click', (event) => {
      seen.push(true);
      lastEvent = event;
    });
    const isolated: Record<string, unknown> = {};
    new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
      fillSource, dom.document, dom.window, isolated, dom.Event, dom.Node, dom.KeyboardEvent,
    );
    attach();
    const calls = isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>;
    expect(calls['login.fill']!({ values: { loginId: 'fake-id', password: 'fake-password' } })).toMatchObject({ state: 'submitted' });
    expect(seen).toEqual([true]);
    expect(lastEvent!.defaultPrevented).toBe(true);
  });

  it('폼 안의 javascript: 앵커는 누르지 않고 폼을 제출한다', () => {
    let submitted = 0;
    let clicked = 0;
    dom.document.body.innerHTML = `<form id="f">${INPUTS}<a href="javascript:goLogin()" id="go">로그인</a></form>`;
    dom.document.querySelector('#f')!.addEventListener('submit', (event) => {
      submitted += 1;
      event.preventDefault();
    });
    dom.document.querySelector('#go')!.addEventListener('click', () => {
      clicked += 1;
    });
    const isolated: Record<string, unknown> = {};
    new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
      fillSource, dom.document, dom.window, isolated, dom.Event, dom.Node, dom.KeyboardEvent,
    );
    const calls = isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>;
    expect(calls['login.fill']!({ values: { loginId: 'fake-id', password: 'fake-password' } })).toMatchObject({ state: 'submitted', method: 'form-request-submit' });
    expect(submitted).toBe(1);
    expect(clicked).toBe(0);
  });

  it('진짜 버튼은 그대로 누른다', () => {
    expect(fill(`<form>${INPUTS}<button type="button">로그인</button></form>`)).toMatchObject({ state: 'submitted', method: 'exact-text' });
  });
});
