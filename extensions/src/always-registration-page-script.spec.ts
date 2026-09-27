// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { ALWAYS_REGISTRATION_FORM } from './sites/always/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 올웨이즈 판매자센터 상품 등록(라이브 실측 2026-09-10): `<form>`이 없는 React 화면이라 칸을 선택자로 잡고, 분류는 검색칸에 치면
// 걸러지는 `대분류 > 중분류 > 소분류` 버튼을 누른다(요청이 나가지 않는다).
const PAGE = `
<div id="root">
  <input id="register-productName"><input id="register-individualPrice"><input id="register-teamPrice">
  <input id="category-search-input"><div id="results"></div>
  <button type="button">등록 요청</button><button type="button">임시저장</button>
</div>`;

const FORM = {
  url: 'https://alwayzseller.ilevit.com/items/registrations',
  selectorFields: { productName: '말랑 키링', individualPrice: '1900', teamPrice: '1500' },
  categoryPaths: [['생활/건강', '문구/사무', '팬시용품']],
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  const picked: string[] = [];
  document.querySelector('#category-search-input').addEventListener('input', (event: { target: { value: string } }) => {
    document.querySelector('#results').innerHTML = event.target.value === '팬시용품'
      ? '<button type="button">생활/건강 > 문구/사무 > 팬시용품</button><button type="button">완구 > 팬시용품</button>'
      : '';
    for (const button of document.querySelectorAll('#results button')) button.addEventListener('click', () => picked.push(button.textContent));
  });
  return { page, picked };
}

describe('올웨이즈 상품등록 폼(KID-256)', () => {
  it('등록 주소만 받는다', () => {
    expect(() => normalizeForm(ALWAYS_REGISTRATION_FORM, { ...FORM, url: 'https://alwayzseller.ilevit.com/shippings' })).toThrow('올웨이즈 상품등록 주소가 아닙니다.');
  });

  it('선택자로 칸을 채우고 분류는 검색 결과에서 전체 경로가 같은 것을 누른다', async () => {
    const { page, picked } = load();
    const { call, payload } = payloadFor(ALWAYS_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector('#register-productName').value).toBe('말랑 키링');
    expect(document.querySelector('#register-teamPrice').value).toBe('1500');
    expect(picked).toEqual(['생활/건강 > 문구/사무 > 팬시용품']);
    expect(outcome.steps).toEqual(expect.arrayContaining(['분류 팬시용품', '상품명', '팀구매가']));
  });

  it('등록 요청·임시저장을 누르지 않는다(KID-237 잠금)', async () => {
    const { page } = load();
    const { call, payload } = payloadFor(ALWAYS_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
    expect(dom.document.body.textContent).toContain('등록 요청');
  });
});
