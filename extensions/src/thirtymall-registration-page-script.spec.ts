// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';
import { THIRTYMALL_REGISTRATION_FORM } from './sites/thirtymall/registration';

// 떠리몰(샵바이 파트너어드민, 실측 2026-09-11): 폼은 다른 도메인 iframe(`partner-remote.shopby.co.kr/product/management/single/add`)
// 안의 React 앱이라 칸에 이름이 없고 표의 줄 제목(`th`)이 손잡이다. 줄 제목은 정확히 같아야 한다(앞이 같은 줄이 있다).
const row = (title: string, control: string) => `<tr><th>${title}</th><td>${control}</td></tr>`;
const PAGE = `
<table>
  ${row('* 상품명', '<input type="text" data-cy="productName">')}
  ${row('판매가', '<input type="text">')}
  ${row('상품 상세(상단)', '<input type="text" id="top">')}
  ${row('배송비 템플릿', '<select><option value="">등록된 템플릿이 없습니다</option></select>')}
</table>
<button type="button">임시저장</button><button type="button">저장</button>`;

const FORM = {
  url: 'https://partner.shopby.co.kr/product/add',
  tableFields: { 상품명: '말랑 키링 1p', 판매가: '830', '상품 상세': '틀린 줄에 들어가면 안 된다' },
  tableSelects: { '배송비 템플릿': '기본 배송비' },
  manualSteps: ['상품정보제공고시는 새 창이라 화면에서 등록하세요'],
};

function load(path = '/product/management/single/add') {
  return loadWritePage(PAGE, [guardSource, fillSource], { path });
}

/** 템플릿 목록은 화면이 서버에서 받아 늦게 채운다. */
const templatesArriveLate = () => setTimeout(() => {
  dom.document.querySelector('select').innerHTML = '<option value="">선택</option><option value="881">기본 배송비</option>';
}, 2_000);

describe('떠리몰 상품등록 폼(KID-256)', () => {
  it('겉 등록 주소만 받는다 — 폼은 그 안 iframe이다', () => {
    expect(() => normalizeForm(THIRTYMALL_REGISTRATION_FORM, { ...FORM, url: 'https://partner-remote.shopby.co.kr/product/management/single/add' })).toThrow('떠리몰 상품등록 주소가 아닙니다.');
  });

  it('겉 문서(폼 프레임 주소가 아닌 곳)에서는 바로 비킨다(noForm)', async () => {
    const page = loadWritePage(PAGE, [guardSource, fillSource], { path: '/product/add' });
    const { call, payload } = payloadFor(THIRTYMALL_REGISTRATION_FORM, FORM);
    await expect(runPageCall(page, call, payload)).resolves.toMatchObject({ ok: false, noForm: true });
  });

  it('줄 제목이 정확히 같은 줄에만 넣고, 늦게 채워지는 템플릿 목록은 보이는 글자가 뜰 때까지 기다려 고른다', async () => {
    const page = load();
    const { call, payload } = payloadFor(THIRTYMALL_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload, { onFakeClock: templatesArriveLate });

    const { document } = dom;
    expect(document.querySelector('[data-cy=productName]').value).toBe('말랑 키링 1p');
    expect(document.querySelector('#top').value).toBe('');
    expect(document.querySelector('select').value).toBe('881');
    expect(outcome.warnings).toEqual(expect.arrayContaining(['상품 상세 칸을 찾지 못했습니다.']));
    expect(outcome.steps).toEqual(expect.arrayContaining(['상품명', '판매가', '배송비 템플릿 기본 배송비']));
  });

  it('임시저장·저장을 누르지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(THIRTYMALL_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
