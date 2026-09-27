// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { BORIBORI_REGISTRATION_FORM } from './sites/boribori/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 보리보리(셀러클럽, 실측 2026-09-11 등록물 `435316017`): 한 백오피스에 몰이 둘이라 사이트(`siteCd`)를 먼저 골라야 분류 목록이
// 보리보리 것으로 바뀐다. 칸이 `<form>` 밖에 있고, 신규 화면에서 담당MD 칸은 잠겨 있을 때가 있다.
const PAGE = `
<div id="app">
  <select name="siteCd"><option value="1">하프클럽</option><option value="2">보리보리</option></select>
  <select name="stdCtgrNo1"><option value="">선택</option><option value="11">패션</option></select>
  <input name="prdCd"><select name="mdNo" disabled><option value="">선택</option></select><input name="prdNm">
  <button type="button">저장</button><button type="button">승인요청</button>
</div>`;

const FORM = {
  url: 'https://seller-club.co.kr/product/productRegister',
  selectorFields: { site: '2', category1: '241', sellerCode: 'KID-3500', md: '77', name: '애니멀 주사위 키링' },
  manualSteps: ['상세설명·고시는 저장 뒤 화면에서 넣으세요'],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  // 사이트를 보리보리로 바꾸면 분류 1단이 유아동·완구·문구 목록으로 통째로 바뀐다.
  document.querySelector('[name=siteCd]').addEventListener('change', () => {
    document.querySelector('[name=stdCtgrNo1]').innerHTML = '<option value="">선택</option><option value="241">문구/팬시</option>';
  });
  return page;
}

describe('보리보리 상품등록 폼(KID-256)', () => {
  it('상품등록 주소만 받는다', () => {
    expect(() => normalizeForm(BORIBORI_REGISTRATION_FORM, { ...FORM, url: 'https://seller-club.co.kr/product/productList' })).toThrow('보리보리 상품등록 주소가 아닙니다.');
  });

  it('사이트를 먼저 골라 보리보리 분류를 고르고 업체상품코드를 채우며, 잠긴 담당MD는 조용히 넘기지 않고 말한다', async () => {
    const page = load();
    const { call, payload } = payloadFor(BORIBORI_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector('[name=siteCd]').value).toBe('2');
    expect(document.querySelector('[name=stdCtgrNo1]').value).toBe('241');
    expect(document.querySelector('[name=prdCd]').value).toBe('KID-3500');
    expect(document.querySelector('[name=prdNm]').value).toBe('애니멀 주사위 키링');
    expect(outcome.warnings).toEqual(expect.arrayContaining(['담당MD 칸이 잠겨 있어 넣지 못했습니다. 화면에서 직접 고르세요.']));
  });

  it('저장·승인요청을 누르지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(BORIBORI_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
