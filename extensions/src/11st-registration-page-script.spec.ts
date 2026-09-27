// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { ST11_REGISTRATION_FORM } from './sites/11st/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadedImage, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

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

// 사진·상세(옛 node 스펙 이식): 사진은 줄의 '+'가 여는 창(id가 매번 다른 `dialog-…`) 안의 파일 칸에 넣고, 같은 제목으로 시작하는
// 라디오 줄이 있어 '+'가 있는 줄만 고른다. 상세는 HTML이 기본 선택된 편집기 뒤 textarea에 넣는다(`#section-description textarea`).
function loadWithImages() {
  const { page } = load();
  const { document } = dom;
  document.querySelector('#app').insertAdjacentHTML('beforeend', `
    <div id="section-image">
      ${box('추가이미지 사용', '<input type="radio" name="useAdd">')}
      ${box('대표 이미지', '<button type="button" class="c-addimg__btn-add" data-dialog="rep">+</button>')}
      ${box('추가이미지', '<button type="button" class="c-addimg__btn-add" data-dialog="add">+</button>')}
    </div>
    <div id="section-description"><textarea></textarea></div>`);
  for (const button of document.querySelectorAll('button.c-addimg__btn-add')) {
    button.addEventListener('click', () => {
      const id = `dialog-${button.dataset.dialog}${Date.now()}`;
      document.body.insertAdjacentHTML('beforeend', `<div id="${id}"><input type="file" multiple></div>`);
      // 사진을 받으면 몰이 자기 CDN에 올리고 창을 스스로 닫는다.
      const dialog = document.getElementById(id);
      dialog.querySelector('input').addEventListener('change', () => { dialog.style.display = 'none'; });
    });
  }
  return page;
}

describe('11번가 사진·상세(KID-256 리뷰 2)', () => {
  it('줄의 +가 연 창 안 파일 칸에 사진을 넣고(라디오 줄은 건너뛴다), 상세는 HTML textarea에 넣으며, 사진이 실려도 저장하지 않는다', async () => {
    const page = loadWithImages();
    const detailHtml = '<center><img referrerpolicy="no-referrer" src="https://kids-wi.kakaocdn.net/dn/aa/bb/1.jpg"></center>';
    const { call, payload } = payloadFor(ST11_REGISTRATION_FORM, FORM, {
      imageGroups: { representative: [loadedImage('rep')], additional: [loadedImage('a1'), loadedImage('a2')] },
      detailHtml,
    });

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    const dialogs = [...document.querySelectorAll('[id^="dialog-"] input[type=file]')] as Array<{ files: File[] }>;
    expect(dialogs.map((input) => input.files.map((file) => file.name))).toEqual([['rep.jpg'], ['a1.jpg', 'a2.jpg']]);
    expect(document.querySelector('#section-description textarea').value).toBe(detailHtml);
    expect(outcome.steps).toEqual(expect.arrayContaining(['대표 이미지 1장', '추가 이미지 2장', '상세설명']));
    expect(page.saves).toEqual([]);
  });
});
