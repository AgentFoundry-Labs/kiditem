// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import registerSource from '../kiditem-os/content/page-call/ad-center-campaign-register.js?raw';
import fixture from './sites/ad-center/__fixtures__/campaign-registration.html?raw';
import { dom, loadWritePage, withFakeClock } from './sites/mall-write/write-page.fake';

// 광고센터 캠페인 등록 페이지 처리기(KID-386). 실광고센터에는 쓰지 않는다 — 옛 `ads-report.js`가 기대한 셀렉터로 만든
// fixture에서 채우기·완료·결과 읽기를 본다. 화면 반응(다음 → 등록 화면, 검색 → 결과, 완료 → 확인 대화상자, 등록 → 결과 화면)은
// 여기서 건다.

type Calls = Record<string, (args?: unknown) => Promise<Record<string, any>>>;

const PLAN = { name: '봄 신상 캠페인', adGroupName: '봄 그룹', productIds: ['70011', '70022'], dailyBudget: 50000, targetRoas: 350 };

function load(options: { path?: string; results?: Record<string, string[]>; afterConfirmPath?: string | null; removeSelector?: string } = {}) {
  const page = loadWritePage(fixture, [], { path: options.path ?? '/marketing/campaign/type' });
  const { window, document } = dom;
  delete window.__kiditemIsolatedPageCalls;
  const clicks: string[] = [];
  const results = options.results ?? { '70011': ['70011 봄 원피스'], '70022': ['70022 봄 모자'] };
  if (options.path === '/marketing/campaign/registration') {
    document.querySelector('#type-step').hidden = true;
    document.querySelector('#registration-step').hidden = false;
  }
  document.querySelector('#type-next').addEventListener('click', () => {
    clicks.push('다음');
    setTimeout(() => {
      window.history.pushState({}, '', '/marketing/campaign/registration');
      document.querySelector('#type-step').hidden = true;
      document.querySelector('#registration-step').hidden = false;
    }, 600);
  });
  document.querySelector('#product-search-button').addEventListener('click', () => {
    const query = document.querySelector('#product-search').value;
    // 검색 결과는 늦게 온다(AJAX).
    setTimeout(() => {
      const list = document.querySelector('#product-results');
      list.innerHTML = '';
      for (const label of results[query] ?? []) {
        const li = document.createElement('li');
        li.setAttribute('data-bigfoot-component', 'vendor_item');
        li.innerHTML = `<span>${label}</span><button type="button">상품 선택</button>`;
        li.querySelector('button').addEventListener('click', () => {
          clicks.push(`상품 선택 ${label}`);
          document.querySelector('#selected-products').innerHTML += `<li>${label}</li>`;
        });
        list.appendChild(li);
      }
    }, 900);
  });
  document.querySelector('#complete').addEventListener('click', () => {
    clicks.push('완료');
    document.querySelector('#confirm-dialog').hidden = false;
  });
  document.querySelector('#dialog-confirm').addEventListener('click', () => {
    clicks.push('등록');
    document.querySelector('#confirm-dialog').hidden = true;
    const after = options.afterConfirmPath === undefined ? '/marketing/campaign/88123/detail' : options.afterConfirmPath;
    // 결과 화면으로 옮기는 것은 확인을 누른 뒤다(가짜 시계는 호출마다 새로 걸리므로 바로 옮긴다).
    if (after) window.history.pushState({}, '', after);
  });
  if (options.removeSelector) document.querySelector(options.removeSelector).remove();
  new Function(registerSource)();
  void page;
  return { calls: window.__kiditemIsolatedPageCalls as Calls, clicks, document };
}

const run = (calls: Calls, call: string, args?: unknown) => withFakeClock(() => calls[call](args));

describe('광고센터 캠페인 등록 처리기(KID-386)', () => {
  it('광고 목표 화면에서 [다음]으로 등록 화면에 가 이름·그룹·상품·자동 운영(목표 광고수익률)·일 예산을 채우고 [완료]는 누르지 않는다', async () => {
    const { calls, clicks, document } = load();

    const filled = await run(calls, 'adCenter.campaignFill', PLAN);

    expect(filled).toEqual({ state: 'filled', selected: ['70011', '70022'] });
    expect(clicks).toEqual(['다음', '상품 선택 70011 봄 원피스', '상품 선택 70022 봄 모자']);
    expect(document.querySelector('#campaign-name').value).toBe('봄 신상 캠페인');
    expect(document.querySelector('#reg_ad_group_name').value).toBe('봄 그룹');
    expect(document.querySelector('[value=AUTO]').checked).toBe(true);
    expect(document.querySelector('[value=PRODUCT_TARGET_ROAS]').checked).toBe(true);
    expect(document.querySelector('[data-testid=budget-input]').value).toBe('50000');
    expect(document.querySelector('[data-bigfoot-component=target_roas] input').value).toBe('350');
  });

  it('목표 광고수익률이 없으면 매출 스타트(예산)를 고르고, 그룹 이름이 없으면 캠페인 이름을 쓴다', async () => {
    const { calls, document } = load({ path: '/marketing/campaign/registration' });

    await run(calls, 'adCenter.campaignFill', { ...PLAN, adGroupName: undefined, targetRoas: null, productIds: ['70011'] });

    expect(document.querySelector('[value=PRODUCT_TARGET_BUDGET]').checked).toBe(true);
    expect(document.querySelector('#reg_ad_group_name').value).toBe('봄 신상 캠페인');
    expect(document.querySelector('[data-bigfoot-component=target_roas] input').value).toBe('');
  });

  it('상품 번호가 적힌 줄이 없고 결과가 여럿이면 고르지 않고 product_not_found로 답한다(다른 상품을 광고하지 않는다)', async () => {
    const { calls, clicks } = load({ results: { '70011': ['70011 봄 원피스'], '70022': ['99901 다른 상품', '99902 또 다른 상품'] } });

    const filled = await run(calls, 'adCenter.campaignFill', PLAN);

    expect(filled).toEqual({ state: 'product_not_found', productIds: ['70022'], selected: ['70011'] });
    expect(clicks).not.toContain('완료');
  });

  it('결과가 한 줄이어도 다른 계획 상품·이미 고른 상품의 번호가 적힌 줄이면 고르지 않는다(앞 상품의 남은 줄)', async () => {
    const { calls, clicks } = load({ results: { '70011': ['70011 봄 원피스'], '70022': ['70011 봄 원피스'] } });

    const filled = await run(calls, 'adCenter.campaignFill', PLAN);

    expect(filled).toEqual({ state: 'product_not_found', productIds: ['70022'], selected: ['70011'] });
    expect(clicks.filter((click) => click.startsWith('상품 선택'))).toHaveLength(1);
  });

  it('번호가 안 적힌 한 줄 결과는 고른다(검색이 그 상품 하나를 찾았다)', async () => {
    const { calls } = load({ results: { '70011': ['봄 원피스'], '70022': ['봄 모자'] } });

    const filled = await run(calls, 'adCenter.campaignFill', PLAN);

    expect(filled).toEqual({ state: 'filled', selected: ['70011', '70022'] });
  });

  it('등록 폼 칸이 없으면 그 칸 이름으로 form_changed를 답한다', async () => {
    const { calls, clicks } = load({ removeSelector: '#reg_ad_group_name' });

    const filled = await run(calls, 'adCenter.campaignFill', PLAN);

    expect(filled).toEqual({ state: 'form_changed', missing: '광고 그룹 이름 입력칸' });
    expect(clicks).toEqual(['다음']);
  });

  it('[완료] → 확인 대화상자의 [등록]을 누르고, 결과 화면 주소에서 캠페인 번호를 읽는다', async () => {
    const { calls, clicks } = load({ path: '/marketing/campaign/registration' });
    await run(calls, 'adCenter.campaignFill', { ...PLAN, productIds: ['70011'] });

    const submitted = await run(calls, 'adCenter.campaignSubmit');
    const result = await run(calls, 'adCenter.campaignResult');

    expect(submitted).toEqual({ state: 'pressed', confirmed: true });
    expect(clicks.slice(-2)).toEqual(['완료', '등록']);
    expect(result).toMatchObject({ campaignId: '88123', stayed: false, validation: null });
  });

  it('누른 뒤 등록 화면에 남으면 캠페인 번호 없이 검증 문구를 알린다', async () => {
    const { calls, document } = load({ path: '/marketing/campaign/registration', afterConfirmPath: null });
    await run(calls, 'adCenter.campaignFill', { ...PLAN, productIds: ['70011'] });
    await run(calls, 'adCenter.campaignSubmit');
    document.querySelector('#registration-step').insertAdjacentHTML('beforeend', '<p>상품을 선택해주세요</p>');

    const result = await run(calls, 'adCenter.campaignResult');

    expect(result).toMatchObject({ campaignId: null, stayed: true, validation: '등록 화면에 검증 문구가 남아 있습니다.' });
  });

  it('[완료] 버튼이 없으면 누르지 않고 form_changed', async () => {
    const { calls, clicks } = load({ path: '/marketing/campaign/registration', removeSelector: '#complete' });

    const submitted = await run(calls, 'adCenter.campaignSubmit');

    expect(submitted).toEqual({ state: 'form_changed', missing: '완료 버튼' });
    expect(clicks).toEqual([]);
  });
});
