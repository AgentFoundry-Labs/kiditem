// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';
import { ONCH_REGISTRATION_FORM } from './sites/onch/registration';

// 온채널 상품등록(`/regist_pending_products.php`, 라이브 실측 2026-09-10): 약관동의 → 기본 정보 단계, 같은 이름 칸 묶음
// (`product_subject[]`), 고시 분류를 고르면 고시 칸이 생기는 방아쇠.
const PAGE = `
<form id="registProductForm">
  <input type="radio" name="product_supp_sec" value="1"><input type="radio" name="product_supp_sec" value="2">
  <input type="checkbox" name="agree_terms">
  <button type="button" id="next">상품 기본 정보 입력</button>
  <input name="product_name">
  <select name="notification_cate_num"><option value="">선택</option><option value="35">완구</option></select>
  ${Array.from({ length: 3 }, () => '<input name="product_subject[]">').join('')}
  <button type="button">임시저장</button>
  <button type="button">등록하기</button>
</form>`;

const FORM = {
  url: 'https://www.onch3.co.kr/regist_pending_products.php',
  fields: { product_name: '말랑 키링', notification_cate_num: '35' },
  radios: { product_supp_sec: '2' },
  groups: { keywords: ['키링', '말랑', '열쇠고리', '가방고리'] },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  const log: string[] = [];
  document.querySelector('#next').addEventListener('click', () => {
    log.push(`next agree=${document.querySelector('[name=agree_terms]').checked} supp=${document.querySelector('[name=product_supp_sec]:checked')?.value}`);
  });
  // 고시 분류를 고르면 고시 칸이 생긴다(몰 화면의 AJAX 흉내).
  document.querySelector('[name=notification_cate_num]').addEventListener('change', () => {
    const box = document.createElement('input');
    box.name = 'prd_model';
    document.querySelector('#registProductForm').appendChild(box);
  });
  return { page, log };
}

describe('온채널 상품등록 폼(KID-256)', () => {
  it('등록 대기 주소만 받는다', () => {
    expect(normalizeForm(ONCH_REGISTRATION_FORM, FORM).url).toBe('https://www.onch3.co.kr/regist_pending_products.php');
    expect(() => normalizeForm(ONCH_REGISTRATION_FORM, { ...FORM, url: 'https://www.onch3.co.kr/order_list.php' })).toThrow('온채널 상품등록 주소가 아닙니다.');
  });

  it('약관동의를 채운 뒤 기본 정보 단계로 넘기고, 고시 칸을 만든 뒤 같은 이름 칸을 순서대로 채운다 — 모자라면 말한다', async () => {
    const { page, log } = load();
    const { call, payload } = payloadFor(ONCH_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(log).toEqual(['next agree=true supp=2']);
    expect(outcome.steps).toEqual(expect.arrayContaining(['약관동의 통과', 'notification_cate_num 선택 후 항목 1칸 생성', 'keywords 3칸']));
    expect([...document.querySelectorAll('[name="product_subject[]"]')].map((el: { value: string }) => el.value)).toEqual(['키링', '말랑', '열쇠고리']);
    expect(outcome.warnings).toEqual(expect.arrayContaining(['keywords 1개는 칸이 모자라 넣지 못했습니다.']));
    expect(document.querySelector('[name=product_name]').value).toBe('말랑 키링');
  });

  it('저장·등록을 누르지 않고 폼을 보내지 않는다(KID-237 잠금)', async () => {
    const { page } = load();
    const { call, payload } = payloadFor(ONCH_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
