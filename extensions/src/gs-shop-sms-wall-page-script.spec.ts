// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/gs-shop-orders.js?raw';

// GS샵 SMS 벽 판정(KID-380 D2)을 실제 파일 그대로 jsdom 화면에 돌린다. 로그인 화면(`/sign-in`)에는 "SMS 인증 불가로 정보
// 변경 필요 시" 같은 고정 안내문이 있어 글자만으로는 벽과 구별되지 않는다 — 벽에만 있는 요소(인증번호 칸·[인증번호 받기])로 본다.
const LOGIN_PAGE = `<main>
  <h1>협력사 로그인</h1>
  <form><input type="text" name="userId" placeholder="아이디"><input type="password" name="password" placeholder="비밀번호">
  <button type="submit">로그인</button></form>
  <p>SMS 인증 불가로 정보 변경 필요 시 담당 MD에게 문의하세요.</p>
</main>`;
const SMS_WALL = `<main>
  <h1>SMS 인증</h1>
  <p>인증방식을 선택하세요.</p>
  <input type="text" name="authNo" placeholder="인증번호 6자리"><button type="button">인증번호 받기</button><button type="button">확인</button>
</main>`;

// 확장 tsconfig에는 DOM 타입이 없다 — jsdom 전역을 필요한 모양으로만 본다.
const dom = globalThis as unknown as {
  document: { body: { innerHTML: string } };
  HTMLElement: { prototype: object };
  getComputedStyle: unknown;
};

// jsdom에는 innerText가 없다 — 화면 글자로 판정하던 옛 규칙과 같은 값을 보게 textContent로 채운다.
Object.defineProperty(dom.HTMLElement.prototype, 'innerText', { configurable: true, get(this: { textContent: string }) { return this.textContent; } });

function load(html: string, href = 'https://partners.gsshop.com/sign-in') {
  dom.document.body.innerHTML = html;
  const window: Record<string, unknown> = { __kiditemPageCalls: {} };
  const immediate = (callback: () => void) => callback();
  let now = 0;
  const FastDate = class extends Date {
    static override now() {
      now += 5_000;
      return now;
    }
  };
  new Function('window', 'document', 'URL', 'Date', 'setTimeout', 'location', 'getComputedStyle', source)(
    window, dom.document, { createObjectURL: () => 'blob:x' }, FastDate, immediate, { href }, dom.getComputedStyle,
  );
  const calls = window.__kiditemPageCalls as Record<string, () => Promise<Record<string, unknown>>>;
  return { orders: calls['gs-shop.orders']!, smsWall: calls['gs-shop.smsWall']! };
}

describe('gs-shop SMS 벽 판정(KID-380 D2)', () => {
  it('아이디·비밀번호 폼이 있는 로그인 화면은 SMS 안내문이 있어도 벽이 아니다 — login_required', async () => {
    const page = load(LOGIN_PAGE);
    await expect(page.smsWall()).resolves.toEqual({ sms: false });
    await expect(page.orders()).resolves.toMatchObject({ errorCode: 'login_required', pendingLogin: true });
  });

  it('인증번호 칸과 [인증번호 받기]가 있는 화면만 SMS 벽이다 — pendingAuth', async () => {
    const page = load(SMS_WALL);
    await expect(page.smsWall()).resolves.toEqual({ sms: true });
    await expect(page.orders()).resolves.toMatchObject({ pendingAuth: true, errorCode: 'operator_action_required' });
  });

  it('[인증번호 받기]가 비활성이거나 숨어 있으면 벽으로 보지 않는다', async () => {
    await expect(load(SMS_WALL.replace('<button type="button">인증번호 받기</button>', '<button type="button" disabled>인증번호 받기</button>')
      .replace('name="authNo" placeholder="인증번호 6자리"', 'name="q" style="display:none"')).smsWall()).resolves.toEqual({ sms: false });
  });
});
