// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { DOMEGGOOK_REGISTRATION_FORM } from './sites/domeggook/registration';
import { dom, loadedImage, loadWritePage as load, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

const loadWritePage = (html: string) => load(html, [guardSource, fillSource]);

// 도매꾹 상품등록 폼(`/sc/item/regFrm`, 라이브 실측 2026-09-10) 채우기를 실제 페이지 처리기로 본다. 화면은 칸 이름·선택자만
// 흉내 낸다 — 키워드 10칸은 이름이 없고(`input.lKeywordTmp`), 원산지는 계단식 목록, 출고지는 첫 항목을 고른다.
const PAGE = `
<form id="lFormRegItem" name="lFormRegItem">
  <input name="itemName"><input name="itemPrice">
  <input type="file" name="image1"><input type="file" name="image2">
  ${Array.from({ length: 10 }, () => '<input class="lKeywordTmp">').join('')}
  <input type="hidden" name="itemKeyword">
  <button type="button" id="lImageAllow">이미지 사용허용</button>
  <select id="lItemCountrySelect1"><option value="">선택</option><option value="수입산">수입산</option></select>
  <select name="deliShippingArea"><option value="">선택</option><option value="A1">내 출고지</option></select>
  <select name="returnShippingArea"><option value="">선택</option></select>
  <textarea name="itemMemo[Item]"></textarea>
  <button type="button" id="lBtnWriteItemMemo">상품상세내용 작성하기</button>
  <button type="button" onclick="this.form.submit()">임시저장</button>
  <button type="submit">등록</button>
</form>`;

const FORM = {
  url: 'https://www.domeggook.com/sc/item/regFrm',
  fields: { itemName: '말랑 키링 1p + 키워드', itemPrice: 830 },
  groups: { keywords: ['키링', '말랑', '열쇠고리'] },
  selectorFields: { originType: '수입산' },
  manualSteps: ['분류를 확인하세요'],
};

describe('도매꾹 상품등록 폼 채우기(content/page-call/form-fill.js, KID-256)', () => {
  it('이름 있는 칸·이름 없는 키워드 칸·계단식 목록을 채우고, 고를 주소가 없는 칸은 사람에게 넘긴다', async () => {
    const page = loadWritePage(PAGE);
    const { call, payload } = payloadFor(DOMEGGOOK_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(outcome.ok).toBe(true);
    expect(document.querySelector('[name=itemName]').value).toBe('말랑 키링 1p + 키워드');
    expect(document.querySelector('[name=itemPrice]').value).toBe('830');
    expect([...document.querySelectorAll('input.lKeywordTmp')].map((el: { value: string }) => el.value).slice(0, 4)).toEqual(['키링', '말랑', '열쇠고리', '']);
    expect(document.querySelector('#lItemCountrySelect1').value).toBe('수입산');
    expect(document.querySelector('[name=deliShippingArea]').value).toBe('A1');
    expect(outcome.steps).toEqual(expect.arrayContaining(['원산지 구분']));
    expect(outcome.warnings.some((warning: string) => warning.includes('returnShippingArea'))).toBe(true);
  });

  it('저장·임시저장·[등록]을 누르지 않고 폼을 보내지 않는다(KID-237 잠금)', async () => {
    const page = loadWritePage(PAGE);
    const { call, payload } = payloadFor(DOMEGGOOK_REGISTRATION_FORM, FORM);

    await runPageCall(page, call, payload);

    expect(page.saves).toEqual([]);
    // 잠금이 보는 것이 맞는지: 사람이 [등록]을 누르면 기록된다.
    dom.document.querySelector('button[type=submit]').click();
    expect(page.saves).toEqual(['click 등록', 'submit lFormRegItem']);
  });

  it('몰이 채우는 동안 띄운 확인 창은 거절하고(쓰기 탭) 알림은 몰 안내 경고로 돌려준다', async () => {
    const page = loadWritePage(PAGE);
    const answers: boolean[] = [];
    dom.document.querySelector('#lItemCountrySelect1').addEventListener('change', () => {
      dom.window.alert('원산지를 확인하세요');
      answers.push(dom.window.confirm('임시저장 할까요?'));
    });
    const { call, payload } = payloadFor(DOMEGGOOK_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    expect(answers).toEqual([false]);
    expect(outcome.warnings).toEqual(expect.arrayContaining(['몰 안내: 원산지를 확인하세요']));
    expect(outcome.dialogs).toEqual(['원산지를 확인하세요', '임시저장 할까요?']);
  });
});

// 상세(옛 node 스펙 `mall-form-detail-editor` 이식): '상품상세내용 작성하기'가 여는 팝업 에디터를 `window.open`이 돌려준 창으로 잡아
// 상품정보 칸에 상세 HTML을 넣고, 켜져 있는데 비어 있는 항목은 끄고(내용·이미지가 있으면 둔다), 홍보는 값이 있으면 채운 채 둔다.
// 에디터 [등록]이 opener 콜백으로 등록화면 칸을 채운다. 몰이 띄우는 알림은 삼켜 몰의 말로 돌려준다.
const EDITOR_ARGS = {
  formSelector: '#lFormRegItem',
  target: 'itemMemo[Item]',
  buttonId: 'lBtnWriteItemMemo',
  editorKey: 'Item',
  toggleSelector: 'input.lBtnContentType',
  framePrefix: 'easyWebEditor_lTextarea',
  frameSuffix: '_iframe',
  submitId: 'lBtnSubmit',
  promoKey: 'OtherItem',
  openTimeoutMs: 20_000,
  submitTimeoutMs: 20_000,
};
const DETAIL_HTML = '<center><img referrerpolicy="no-referrer" src="https://kids-wi.kakaocdn.net/dn/aa/bb/1.jpg"></center>';

function editorPopup(options: { notice?: string; alertOnSubmit?: string } = {}) {
  const popup = new JSDOM(`
    ${['Item', 'Notice', 'Guide', 'OtherItem'].map((key) => `<input type="checkbox" class="lBtnContentType" value="${key}" checked><iframe id="easyWebEditor_lTextarea${key}_iframe"></iframe>`).join('')}
    <button id="lBtnSubmit">등록</button>`).window;
  popup.document.querySelector('#easyWebEditor_lTextareaNotice_iframe').contentDocument.body.innerHTML = options.notice ?? '<p><br></p>';
  popup.document.querySelector('#easyWebEditor_lTextareaGuide_iframe').contentDocument.body.innerHTML = '<p>교환·반품 안내</p>';
  popup.document.querySelector('#lBtnSubmit').addEventListener('click', () => {
    if (options.alertOnSubmit) {
      popup.alert(options.alertOnSubmit);
      return;
    }
    // opener 콜백: 에디터 상품정보를 등록화면 칸으로 옮긴다.
    dom.document.querySelector('[name="itemMemo[Item]"]').value = popup.document.querySelector('#easyWebEditor_lTextareaItem_iframe').contentDocument.body.innerHTML;
  });
  return popup;
}

function openEditorFrom(page: ReturnType<typeof loadWritePage>, popup: ReturnType<typeof editorPopup> | null) {
  // 버튼이 몰 스크립트처럼 `window.open`을 부른다.
  dom.window.open = () => popup;
  dom.document.querySelector('#lBtnWriteItemMemo').addEventListener('click', () => dom.window.open('https://www.domeggook.com/main/mySell/register/my_sellInfoFormEditor.php'));
  return page;
}

describe('도매꾹 상세 — 작성하기 에디터(mallForm.detailEditor, KID-256 리뷰 2)', () => {
  it('버튼이 연 창을 잡아 상품정보에 상세를 넣고, 빈 항목만 끄고, 홍보는 채운 채 두고, 에디터 [등록]으로 등록화면 칸을 채운다', async () => {
    const popup = editorPopup();
    const page = openEditorFrom(loadWritePage(PAGE), popup);

    const outcome = await runPageCall(page, 'mallForm.detailEditor', { ...EDITOR_ARGS, html: DETAIL_HTML, promoHtml: '<p>다른 상품도 보세요</p>' });

    expect(outcome).toMatchObject({ ok: true, filled: true, alerts: [], turnedOff: ['Notice'] });
    expect(dom.document.querySelector('[name="itemMemo[Item]"]').value).toBe(DETAIL_HTML);
    const checked = [...popup.document.querySelectorAll('input.lBtnContentType')].filter((box) => (box as { checked: boolean }).checked).map((box) => (box as { value: string }).value);
    expect(checked).toEqual(['Item', 'Guide', 'OtherItem']);
    expect(popup.document.querySelector('#easyWebEditor_lTextareaOtherItem_iframe').contentDocument.body.innerHTML).toBe('<p>다른 상품도 보세요</p>');
    // 등록화면은 저장하지 않는다 — 누른 것은 에디터 안의 [등록]뿐이다.
    expect(page.saves).toEqual([]);
  });

  it('홍보 값이 없으면 그 항목도 끈다 · 이미지만 있는 항목은 내용으로 본다', async () => {
    const popup = editorPopup({ notice: '<img src="https://kids-wi.kakaocdn.net/dn/notice.jpg">' });
    const page = openEditorFrom(loadWritePage(PAGE), popup);
    const outcome = await runPageCall(page, 'mallForm.detailEditor', { ...EDITOR_ARGS, html: DETAIL_HTML, promoHtml: '' });
    expect(outcome.turnedOff).toEqual(['OtherItem']);
  });

  it('창이 열리지 않으면 까닭을 돌려준다 · 몰이 띄운 알림은 삼켜 몰의 말로 돌려주고 반쯤 열린 창을 닫는다', async () => {
    const closed = loadWritePage(PAGE);
    openEditorFrom(closed, null);
    await expect(runPageCall(closed, 'mallForm.detailEditor', { ...EDITOR_ARGS, html: DETAIL_HTML })).resolves.toEqual({ ok: false, error: '상세내용 에디터 창이 열리지 않았습니다.' });

    const popup = editorPopup({ alertOnSubmit: '상품정보고시를 입력해주세요' });
    let popupClosed = false;
    popup.close = () => { popupClosed = true; };
    const page = openEditorFrom(loadWritePage(PAGE), popup);
    const outcome = await runPageCall(page, 'mallForm.detailEditor', { ...EDITOR_ARGS, html: DETAIL_HTML });
    expect(outcome).toMatchObject({ ok: true, filled: false, alerts: ['상품정보고시를 입력해주세요'] });
    expect(popupClosed).toBe(true);
  });
});

describe('도매꾹 사진 칸(KID-256 리뷰 2)', () => {
  it('서비스워커가 읽어 넘긴 사진을 이름이 같은 파일 칸에 넣고, 사진이 실려도 임시저장·등록을 누르지 않는다(KID-237 잠금)', async () => {
    const page = loadWritePage(PAGE);
    const { call, payload } = payloadFor(DOMEGGOOK_REGISTRATION_FORM, FORM, { images: [loadedImage('image1'), loadedImage('image2'), loadedImage('image9')] });

    const outcome = await runPageCall(page, call, payload);

    expect(dom.document.querySelector('[name=image1]').files.map((file: File) => file.name)).toEqual(['image1.jpg']);
    expect(dom.document.querySelector('[name=image2]').files.map((file: File) => file.name)).toEqual(['image2.jpg']);
    expect(outcome.steps).toEqual(expect.arrayContaining(['이미지 image1', '이미지 image2']));
    expect(outcome.warnings).toContain('이미지 칸 image9 이 없습니다.');
    expect(page.saves).toEqual([]);
  });
});
