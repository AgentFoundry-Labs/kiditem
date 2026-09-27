// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { ST11_REGISTRATION_FORM } from './sites/11st/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 11번가 셀러오피스 신규상품 등록(라이브 실측 2026-09-10): 폼은 iframe 안의 Vue 앱이고, 칸 이름이 런타임 해시라 블록 id + 행
// 제목으로 잡는다. 배송 템플릿은 계정마다 다른 번호라 보이는 글자로 고른다. 광고 블록은 켜지면 셀러캐시가 나가므로 건드리지 않는다.
const box = (title: string, control: string) => `<div class="b-box__row"><div class="b-box__title">${title}<span>필수입력</span></div><div class="b-box__cont">${control}</div></div>`;
const PAGE = `
<div id="app" class="l-content--product">
  <div id="section-name">${box('상품명', '<input>')}${box('홍보문구', '<input>')}</div>
  <div id="section-option">${box('판매가', '<input>')}</div>
  <div id="section-delivery">${box('템플릿 목록', '<select><option value="">선택</option><option value="T981">기본 택배 3,000원</option></select>')}</div>
  <div id="section-advertisement"><label><input type="checkbox" id="focus-click">포커스클릭</label><button type="button" id="ad-on">광고 신청</button></div>
  <button type="button">임시저장</button><button type="button">등록하기</button>
</div>`;

const FORM = {
  url: 'https://soffice.11st.co.kr/view/123124025',
  rowFields: { productName: '말랑 키링 1p', promoText: '가방 장식', salePrice: '830' },
  rowOptions: { deliveryTemplate: '기본 택배 3,000원' },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const touched: string[] = [];
  dom.document.querySelector('#section-advertisement').addEventListener('click', (event: { target: { id: string } }) => touched.push(event.target.id), true);
  return { page, touched };
}

describe('11번가 상품등록 폼(KID-256)', () => {
  it('신규상품 등록 메뉴 번호까지 맞아야 받는다 — 다른 메뉴에 값을 넣지 않는다', () => {
    expect(() => normalizeForm(ST11_REGISTRATION_FORM, { ...FORM, url: 'https://soffice.11st.co.kr/view/123124026' })).toThrow('11번가 상품등록 주소가 아닙니다.');
  });

  it('블록 id + 행 제목으로 칸을 잡고 배송 템플릿은 보이는 글자로 고르며, 광고 블록은 건드리지 않는다', async () => {
    const { page, touched } = load();
    const { call, payload } = payloadFor(ST11_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect([...document.querySelectorAll('#section-name input')].map((el: { value: string }) => el.value)).toEqual(['말랑 키링 1p', '가방 장식']);
    expect(document.querySelector('#section-option input').value).toBe('830');
    expect(document.querySelector('#section-delivery select').value).toBe('T981');
    expect(outcome.steps).toEqual(expect.arrayContaining(['상품명', '홍보문구', '판매가', '배송정보 템플릿 기본 택배 3,000원']));
    expect(touched).toEqual([]);
    expect(document.querySelector('#focus-click').checked).toBe(false);
  });

  it('임시저장·등록하기를 누르지 않는다(KID-237 잠금)', async () => {
    const { page } = load();
    const { call, payload } = payloadFor(ST11_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
