// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { KKOMANGSE_REGISTRATION_FORM } from './sites/kkomangse/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 꼬망세몰(EduPre 임대몰, 실측 2026-09-11 등록물 `_code=H7984-C3488-G2602`): KC 번호 칸은 `인증`을 누르기 전까지 잠겨 있고,
// 분류는 계단식(다음 단 목록이 AJAX로 온다)이며 다 고른 뒤 `선택 카테고리 추가`를 눌러야 붙는다.
const PAGE = `
<form name="frm">
  <input name="_name"><input name="_price">
  <input type="radio" name="_kc_yn" value="N" checked><input type="radio" name="_kc_yn" value="Y">
  <input name="_kc_number" disabled>
  <select name="pass_cate01"><option value="">선택</option><option value="278">교구</option></select>
  <select name="pass_cate02"><option value="">선택</option></select>
  <select name="pass_cate03"><option value="">선택</option></select>
  <a href="#" id="add-cate">선택 카테고리 추가</a>
  <div id="cates"></div>
  <button type="button">저장</button>
</form>`;

const FORM = {
  url: 'https://nstore.edupre.co.kr/subAdmin/_product.form.php?_mode=add',
  fields: { _name: '전동오토버블건 1p 비눗방울', _price: '5060', _kc_number: 'CB065R1579-2008' },
  radios: { _kc_yn: 'Y' },
  selectorFields: { category1: '278', category2: '279', category3: '288' },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  const option = (select: { appendChild(node: unknown): void }, value: string) => {
    const el = document.createElement('option');
    el.value = value;
    el.textContent = value;
    select.appendChild(el);
  };
  // 인증을 누르면 KC 번호 칸이 풀린다.
  document.querySelector('[name=_kc_yn][value=Y]').addEventListener('click', () => {
    document.querySelector('[name=_kc_number]').disabled = false;
  });
  // 앞 단을 고르면 다음 단 목록이 늦게 온다(AJAX).
  document.querySelector('[name=pass_cate01]').addEventListener('change', () => setTimeout(() => option(document.querySelector('[name=pass_cate02]'), '279'), 900));
  document.querySelector('[name=pass_cate02]').addEventListener('change', () => setTimeout(() => option(document.querySelector('[name=pass_cate03]'), '288'), 900));
  document.querySelector('#add-cate').addEventListener('click', (event: { preventDefault(): void }) => {
    event.preventDefault();
    document.querySelector('#cates').innerHTML += '<a onclick="category_delete(1)">삭제</a>';
  });
  return page;
}

describe('꼬망세몰 상품등록 폼(KID-256)', () => {
  it('상품등록 주소만 받는다', () => {
    expect(() => normalizeForm(KKOMANGSE_REGISTRATION_FORM, { ...FORM, url: 'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php' })).toThrow('꼬망세몰 상품등록 주소가 아닙니다.');
  });

  it('KC 인증 라디오를 칸보다 먼저 눌러 번호 칸을 풀고, 계단식 분류를 목록이 올 때까지 기다려 고른 뒤 `선택 카테고리 추가`로 붙인다', async () => {
    const page = load();
    const { call, payload } = payloadFor(KKOMANGSE_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector('[name=_kc_number]').value).toBe('CB065R1579-2008');
    expect(document.querySelector('[name=pass_cate03]').value).toBe('288');
    expect(outcome.steps).toEqual(expect.arrayContaining(['분류 1단', '분류 2단', '분류 3단', '선택 카테고리 추가']));
    expect(document.querySelectorAll('[onclick*="category_delete"]')).toHaveLength(1);
    // 상세 사진 없이 채웠으니 그 말만 남는다.
    expect(outcome.warnings).toEqual(['상세설명에 넣을 것이 없습니다. 상세페이지를 먼저 확정하세요.']);
  });

  it('분류가 다 골라지지 않으면 `선택 카테고리 추가`를 누르지 않고 까닭을 남긴다', async () => {
    const page = load();
    const { call, payload } = payloadFor(KKOMANGSE_REGISTRATION_FORM, { ...FORM, selectorFields: { category1: '278', category2: '999' } });

    const outcome = await runPageCall(page, call, payload);

    expect(dom.document.querySelectorAll('[onclick*="category_delete"]')).toHaveLength(0);
    expect(outcome.warnings).toEqual(expect.arrayContaining(["고를 칸이 다 채워지지 않아 '선택 카테고리 추가' 를 누르지 않았습니다."]));
  });

  it('저장을 누르지 않고 폼을 보내지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(KKOMANGSE_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
