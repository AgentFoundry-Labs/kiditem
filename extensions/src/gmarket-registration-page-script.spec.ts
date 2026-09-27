// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { GMARKET_REGISTRATION_FORM } from './sites/gmarket/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// ESM Plus(지마켓·옥션 한 번에, 실측 2026-09-11 빈 폼 `item.esmplus.com/goods/new`): `<form>`·`name`·`id`가 없는 Next.js 화면이라
// 화면에 찍힌 섹션 제목이 유일한 손잡이다. 칸은 load 뒤 8~10초 더 지나야 그려진다 — 페이지 안에서 기다린다.
const section = (title: string, content: string) => `<div class="box__filter-item"><div class="box__filter-head">${title}<span>필수</span></div><div class="box__filter-content">${content}</div></div>`;
const FIELDS = `
  ${section('상품명', '<input class="form__input">')}
  ${section('판매가', '<input class="form__input"><input class="form__input">')}
  ${section('인증정보', '<label class="form__label">인증대상</label><label class="form__label">상세설명에 별도표기</label>')}`;
const PAGE = `<main class="box__wrap"><div id="fields"></div><button type="button">임시저장</button><button type="button">등록하기</button></main>`;

const FORM = {
  url: 'https://item.esmplus.com/goods/new',
  sectionFields: { 상품명: '말랑 키링 1p', '판매가#1': '830' },
  sectionRadios: { 인증정보: '상세설명에 별도표기' },
  optionalSections: ['어린이제품 인증'],
  manualSteps: [],
};

function load() {
  return loadWritePage(PAGE, [guardSource, fillSource]);
}
/** 칸은 문서가 뜬 뒤 한참 있다가 그려진다(라이브 실측 8~10초). */
const fieldsArriveLate = () => setTimeout(() => {
  dom.document.querySelector('#fields').innerHTML = FIELDS;
}, 9_000);

describe('지마켓·옥션(ESM Plus) 상품등록 폼(KID-256)', () => {
  it('껍데기가 아니라 폼 주소를 받는다', () => {
    expect(() => normalizeForm(GMARKET_REGISTRATION_FORM, { ...FORM, url: 'https://www.esmplus.com/goods/new' })).toThrow('지마켓·옥션 상품등록 주소가 아닙니다.');
  });

  it('칸이 그려질 때까지 페이지 안에서 기다린 뒤 섹션 제목으로 칸·라디오를 찾아 넣고, 분류에 따라 없는 칸은 경고하지 않는다', async () => {
    const page = load();
    const { call, payload } = payloadFor(GMARKET_REGISTRATION_FORM, { ...FORM, sectionFields: { ...FORM.sectionFields, '어린이제품 인증': 'CB065R1579' } });

    const outcome = await runPageCall(page, call, payload, { onFakeClock: fieldsArriveLate });

    const { document } = dom;
    const inputs = [...document.querySelectorAll('input.form__input')].map((el: { value: string }) => el.value);
    expect(inputs).toEqual(['말랑 키링 1p', '', '830']);
    expect(outcome.steps).toEqual(expect.arrayContaining(['인증정보 상세설명에 별도표기', '상품명', '판매가']));
    expect(outcome.warnings.some((warning: string) => warning.includes('어린이제품 인증'))).toBe(false);
  });

  it('칸이 끝내 그려지지 않으면 폼이 없다고 답한다(noForm)', async () => {
    const page = load();
    const { call, payload } = payloadFor(GMARKET_REGISTRATION_FORM, FORM);
    await expect(runPageCall(page, call, payload)).resolves.toMatchObject({ ok: false, noForm: true });
  });

  it('임시저장·등록하기를 누르지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(GMARKET_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload, { onFakeClock: fieldsArriveLate });
    expect(page.saves).toEqual([]);
  });
});
