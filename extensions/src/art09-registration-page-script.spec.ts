// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { mallWriterFor } from './sites/mall-write/writer';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';
import { ART09_REGISTRATION_FORM } from './sites/art09/registration';

// 아트공구(Cafe24 공급사 관리자, 라이브 실측 2026-09-10): 상품분류는 이름으로 한 단씩 눌러 들어간 뒤 '적용'. 대표이미지는 파일
// 칸(폼 밖 `#imageFiles`)으로 올린다 — 주소로 넣으면 Cafe24 서버가 우리 저장소를 못 읽는다.
const column = (names: string[]) => `<ul>${names.map((name) => `<li class="category-item">${name}</li>`).join('')}</ul>`;
const PAGE = `
<form id="eProductRegisterForm"><input name="product_name"></form>
<table id="selectCategoryTable"><tr><td id="c1">${column(['완구/선물'])}</td><td id="c2"></td></tr></table>
<a href="#" id="apply">적용</a>
<div id="applied"></div>
<button type="button">등록</button><button type="button">임시저장</button>`;

const FORM = {
  url: 'https://zzogzzog1.cafe24.com/disp/admin/shop1/product/ProductRegister',
  fields: { product_name: '말랑 키링' },
  categoryPaths: [['완구/선물', '팬시/놀이완구']],
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  document.querySelector('#c1 li').addEventListener('click', () => {
    document.querySelector('#c2').innerHTML = column(['팬시/놀이완구', '학용품']);
  });
  document.querySelector('#apply').addEventListener('click', (event: { preventDefault(): void }) => {
    event.preventDefault();
    document.querySelector('#applied').textContent = '적용됨';
  });
  return page;
}

describe('아트공구 상품등록 폼(KID-256)', () => {
  it('상품등록 화면을 로그인 화면으로 보지 않는다 — 주문 읽기 규칙(주문목록 밖은 로그인)을 쓰지 않는다', () => {
    const writer = mallWriterFor('art09')!;
    expect(writer.guard.isLogin(new URL(FORM.url))).toBe(false);
    expect(writer.guard.isLogin(new URL('https://eclogin.cafe24.com/Shop/'))).toBe(true);
    expect(writer.login!.isLoginUrl(new URL(FORM.url))).toBe(false);
    expect(() => normalizeForm(ART09_REGISTRATION_FORM, { ...FORM, url: 'https://zzogzzog1.cafe24.com/admin/php/shop1/s_new/order_list.php' })).toThrow('아트공구 상품등록 주소가 아닙니다.');
  });

  it('상품분류를 이름으로 한 단씩 눌러 들어간 뒤 적용한다 — 없는 단은 까닭을 남기고 적용하지 않는다', async () => {
    const page = load();
    const { call, payload } = payloadFor(ART09_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    expect(dom.document.querySelector('#applied').textContent).toBe('적용됨');
    expect(outcome.steps).toEqual(expect.arrayContaining(['분류 팬시/놀이완구']));

    const missing = load();
    const other = payloadFor(ART09_REGISTRATION_FORM, { ...FORM, categoryPaths: [['완구/선물', '없는 분류']] });
    const second = await runPageCall(missing, other.call, other.payload);
    expect(dom.document.querySelector('#applied').textContent).toBe('');
    expect(second.warnings).toEqual(expect.arrayContaining(["상품분류 '완구/선물 > 없는 분류' 에서 '없는 분류' 를 찾지 못했습니다."]));
  });

  it('등록·임시저장을 누르지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(ART09_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
