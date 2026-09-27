// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fillSource from '../kiditem-os/content/page-call/login-fill.js?raw';

// 아트공구(Cafe24) 로그인 화면(eclogin.cafe24.com, 실기기 R3)을 실제 파일 그대로 jsdom에 돌린다. 화면은 대표운영자 탭이 열린 채로
// 뜨고(쇼핑몰 아이디 하나 + 비밀번호), 공급사 탭을 눌러야 쇼핑몰 아이디·공급사 아이디·비밀번호 세 칸이 보인다. 숨은 탭의 칸은
// 크기가 0이다(jsdom은 배치를 하지 않아 크기를 가짜로 준다).
const dom = globalThis as unknown as {
  document: { body: { innerHTML: string }; querySelector(selector: string): (HTMLLike & { value: string }) | null };
  window: unknown;
  Element: { prototype: Record<string, unknown> };
  Event: unknown;
  Node: unknown;
  KeyboardEvent: unknown;
};
type HTMLLike = { addEventListener(type: string, listener: () => void): void; classList: { add(name: string): void; remove(name: string): void } };

dom.Element.prototype.getBoundingClientRect = function (this: { closest(selector: string): unknown }) {
  return this.closest('.off') ? { width: 0, height: 0 } : { width: 120, height: 30 };
};

const ECLOGIN = `
  <ul class="tabs"><li><a href="#" id="tab-admin">대표운영자</a></li><li><a href="#" id="tab-supplier">공급사</a></li></ul>
  <form id="admin" action="/Shop/login">
    <input type="text" name="mall_id" title="쇼핑몰 아이디"><input type="password" name="userpasswd" title="비밀번호">
    <button type="submit">로그인</button>
  </form>
  <form id="supplier" class="off" action="/Shop/supplier_login">
    <input type="text" name="mall_id" title="쇼핑몰 아이디"><input type="text" name="supplier_id" title="공급사 아이디">
    <input type="password" name="supplier_passwd" title="비밀번호"><button type="submit">로그인</button>
  </form>`;

function screen() {
  dom.document.body.innerHTML = ECLOGIN;
  const submitted: string[] = [];
  const admin = dom.document.querySelector('#admin')!;
  const supplier = dom.document.querySelector('#supplier')!;
  dom.document.querySelector('#tab-supplier')!.addEventListener('click', () => {
    admin.classList.add('off');
    supplier.classList.remove('off');
  });
  for (const id of ['#admin', '#supplier']) {
    dom.document.querySelector(id)!.addEventListener('submit', (event?: unknown) => {
      submitted.push(id);
      (event as { preventDefault(): void }).preventDefault();
    });
  }
  const isolated: Record<string, unknown> = {};
  new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
    fillSource, dom.document, dom.window, isolated, dom.Event, dom.Node, dom.KeyboardEvent,
  );
  const fill = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>)['login.fill']!;
  return { fill, submitted };
}

const VALUES = { values: { loginId: 'zzogzzog1', supplierLoginId: 'fake-supplier', password: 'fake-password' } };

describe('login-fill.js — Cafe24 공급사 탭(실기기 R3)', () => {
  it('공급사 아이디가 있는데 대표운영자 탭이면 공급사 탭을 누르고 다시 보게 하고, 다음 바퀴에 세 칸을 채워 공급사 폼을 보낸다', () => {
    const page = screen();
    expect(page.fill(VALUES)).toEqual({ state: 'incomplete', reason: 'supplier-tab-opened' });
    expect(page.submitted).toEqual([]);
    const second = page.fill(VALUES);
    expect(second).toMatchObject({ state: 'submitted' });
    expect(page.submitted).toEqual(['#supplier']);
    const form = (name: string) => dom.document.querySelector(`#supplier input[name="${name}"]`)!.value;
    expect([form('mall_id'), form('supplier_id'), form('supplier_passwd')]).toEqual(['zzogzzog1', 'fake-supplier', 'fake-password']);
    expect(dom.document.querySelector('#admin input[name="userpasswd"]')!.value).toBe('');
  });

  it('공급사 탭이 없는 화면이면 예전처럼 공급사 칸을 못 찾았다고 답한다', () => {
    dom.document.body.innerHTML = '<form><input type="text" name="mall_id" title="쇼핑몰 아이디"><input type="password" name="pw"><button>로그인</button></form>';
    const isolated: Record<string, unknown> = {};
    new Function('source', 'document', 'window', 'globalThis', 'Event', 'Node', 'KeyboardEvent', 'return eval(source)')(
      fillSource, dom.document, dom.window, isolated, dom.Event, dom.Node, dom.KeyboardEvent,
    );
    const fill = (isolated.__kiditemIsolatedPageCalls as Record<string, (args: unknown) => Record<string, unknown>>)['login.fill']!;
    expect(fill(VALUES)).toMatchObject({ state: 'incomplete' });
  });
});
