// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { ICECREAM_MALL_REGISTRATION_FORM } from './sites/icecream-mall/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 아이스크림몰(실측 2026-09-11 등록물 `goodsNo=11411122`): 섹션마다 폼이 따로 있어 같은 이름 칸이 여러 폼에 있고, 분류는 코드와
// 경로 두 칸을 함께 쓰며, 고시는 몰 함수(`announcementInfo.eventhandler.getAnnoucementItemInfo` — 몰의 오타 그대로)를 불러야 줄이 생긴다.
const PAGE = `
<form id="goodsInfo"><input name="goodsNm"><input name="deliFcstDt"></form>
<form id="priceInfo"><input name="salePrc"><input name="deliFcstDt"></form>
<input name="stdCtgNo" readonly><input name="stdCtgHierarchy" readonly>
<table id="announcementInfoTable"><tr><th>항목</th></tr></table>
<input type="radio" name="072" value="N" checked><input type="radio" name="072" value="Y">
<button type="button">임시저장</button><button type="button">등록</button>`;

const FORM = {
  url: 'https://po.i-screammall.co.kr/goods/temporaryGeneralGoods.temporaryGeneralGoodsView.do',
  formFields: {
    goodsInfo: { goodsNm: '슈가 귤 쫀득 주물럭 1p', deliFcstDt: '3' },
    priceInfo: { salePrc: '2600' },
  },
  category: { code: 'BC0105010200', path: '아이스크림몰>학급운영>학생선물>장난감/완구' },
  notice: { itemCode: '023', safeCertiTgtYn: 'Y', kcCertified: 'Y', rows: [{ title: '크기, 중량', value: '8x8x7cm' }, { title: '색상', value: '오렌지' }] },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const opened: string[] = [];
  dom.window.announcementInfo = {
    eventhandler: {
      getAnnoucementItemInfo(itemCode: string, safe: string) {
        opened.push(`${itemCode}/${safe}`);
        const table = dom.document.querySelector('#announcementInfoTable');
        table.innerHTML += '<tr><td class="label">크기, 중량 설명</td><td><input type="text"></td></tr><tr><td class="label">색상</td><td><input type="text"></td></tr>';
      },
    },
  };
  return { page, opened };
}

describe('아이스크림몰 상품등록 폼(KID-256)', () => {
  it('상품등록 주소만 받는다', () => {
    expect(() => normalizeForm(ICECREAM_MALL_REGISTRATION_FORM, { ...FORM, url: 'https://po.i-screammall.co.kr/order/list.do' })).toThrow('아이스크림몰 상품등록 주소가 아닙니다.');
  });

  it('칸을 폼 id까지 보고 넣고, 분류는 코드·경로 둘 다, 고시는 몰 함수로 줄을 열어 줄 제목으로 채운다', async () => {
    const { page, opened } = load();
    const { call, payload } = payloadFor(ICECREAM_MALL_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector('#goodsInfo [name=deliFcstDt]').value).toBe('3');
    expect(document.querySelector('#priceInfo [name=deliFcstDt]').value).toBe('');
    expect(document.querySelector('#priceInfo [name=salePrc]').value).toBe('2600');
    expect(document.querySelector('[name=stdCtgNo]').value).toBe('BC0105010200');
    expect(document.querySelector('[name=stdCtgHierarchy]').value).toBe('아이스크림몰>학급운영>학생선물>장난감/완구');
    expect(opened).toEqual(['023/Y']);
    expect([...document.querySelectorAll('#announcementInfoTable input')].map((el: { value: string }) => el.value)).toEqual(['8x8x7cm', '오렌지']);
    expect(document.querySelector('[name="072"]:checked').value).toBe('Y');
    expect(outcome.steps).toEqual(expect.arrayContaining(['goodsInfo 2칸', 'priceInfo 1칸', '분류', '고시 2줄']));
  });

  it('임시저장·등록을 누르지 않는다(KID-237 잠금)', async () => {
    const { page } = load();
    const { call, payload } = payloadFor(ICECREAM_MALL_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
