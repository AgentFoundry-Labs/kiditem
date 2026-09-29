// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import source from '../kiditem-os/content/page-call/login-screen.js?raw';

// 몰 로그인 확인의 화면 읽기 파일(KID-366 `checkMallLogin`)을 실제 파일 그대로 돌린다. 가짜는 보이는 크기와 본문 글자뿐이다.
// 확장 tsconfig에는 dom lib이 없다 — jsdom 전역은 좁은 모양으로만 쓴다.
type Doc = { body: { innerHTML: string } };
const scope = globalThis as unknown as { document: Doc; Element: { prototype: Record<string, unknown> } };

beforeAll(() => {
  scope.Element.prototype.getBoundingClientRect = () => ({ width: 100, height: 20 });
});

function screen(html: string, text = ''): unknown {
  scope.document.body.innerHTML = html;
  Object.defineProperty(scope.document.body, 'innerText', { configurable: true, value: text });
  // 파일의 마지막 식 값(= executeScript 결과)을 그대로 받는다.
  return (0, eval)(source);
}

describe('로그인 화면 읽기 파일', () => {
  it('보이는 아이디·비밀번호 칸이 있으면 로그인 폼이다', () => {
    expect(screen('<input name="id"><input type="password">')).toEqual({ loginForm: true, verification: false });
  });

  it('비밀번호 칸 없이 인증번호 칸과 인증 안내가 있으면 인증 화면이다', () => {
    expect(screen('<input name="authCode" placeholder="인증번호">', '휴대폰 인증 번호를 입력하세요')).toEqual({ loginForm: false, verification: true });
  });

  it('관리자 화면(비밀번호 칸 없음, 안내 없음)은 둘 다 아니다', () => {
    expect(screen('<input name="keyword">', '주문 목록')).toEqual({ loginForm: false, verification: false });
  });
});
