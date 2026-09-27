// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { DOMEGGOOK_REGISTRATION_FORM } from './sites/domeggook/registration';
import { dom, loadWritePage as load, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

const loadWritePage = (html: string) => load(html, [guardSource, fillSource]);

// 도매꾹 상품등록 폼(`/sc/item/regFrm`, 라이브 실측 2026-09-10) 채우기를 실제 페이지 처리기로 본다. 화면은 칸 이름·선택자만
// 흉내 낸다 — 키워드 10칸은 이름이 없고(`input.lKeywordTmp`), 원산지는 계단식 목록, 출고지는 첫 항목을 고른다.
const PAGE = `
<form id="lFormRegItem" name="lFormRegItem">
  <input name="itemName"><input name="itemPrice">
  ${Array.from({ length: 10 }, () => '<input class="lKeywordTmp">').join('')}
  <input type="hidden" name="itemKeyword">
  <button type="button" id="lImageAllow">이미지 사용허용</button>
  <select id="lItemCountrySelect1"><option value="">선택</option><option value="수입산">수입산</option></select>
  <select name="deliShippingArea"><option value="">선택</option><option value="A1">내 출고지</option></select>
  <select name="returnShippingArea"><option value="">선택</option></select>
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
