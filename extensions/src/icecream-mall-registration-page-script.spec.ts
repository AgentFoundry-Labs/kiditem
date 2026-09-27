// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { ICECREAM_MALL_REGISTRATION_FORM } from './sites/icecream-mall/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadedImage, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

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

// 사진·상세(옛 node 스펙 `mall-form-icecream` 이미지·상세 절 이식): 대표이미지는 그룹 방식 파일 칸(`baseImageFile`), 추가 이미지는
// `+`로 칸을 늘려 가며(`imgInfo[N][img]`), 상세는 SmartEditor 2 — 몰 에디터 사진 엔드포인트에 먼저 올리고 HTML 탭으로 넣는다.
const IMAGE_PAGE = `${PAGE}
<input type="file" name="baseImageFile">
<div id="imageInfo"><button type="button">+</button></div>
<div id="yes24Info"><iframe id="yes24"></iframe></div>
<div id="detailInfo"><iframe id="skin"></iframe><textarea name="detailHtmlEditor"></textarea></div>`;

function loadWithImages() {
  const { page, opened } = load();
  // 로드 뒤 화면을 바꾸지 않고 사진·상세 칸만 덧붙인다(처리기는 이미 들어 있다).
  const { document } = dom;
  document.body.insertAdjacentHTML('beforeend', IMAGE_PAGE.slice(PAGE.length));
  document.querySelector('#imageInfo button').addEventListener('click', () => {
    const index = document.querySelectorAll('#imageInfo input[type=file]').length;
    document.querySelector('#imageInfo').insertAdjacentHTML('beforeend', `<input type="file" name="imgInfo[${index}][img]"><input name="imgInfo[${index}][seq]" value="${index + 1}">`);
  });
  // 스킨 iframe 안: HTML 탭 · 소스 칸 · Editor 복귀 · 편집면 iframe. Editor로 돌아가면 소스를 편집면에 옮긴다.
  const skin = document.querySelector('#skin').contentDocument;
  skin.body.innerHTML = '<button class="se2_to_html">HTML</button><textarea class="se2_input_htmlsrc"></textarea><button class="se2_to_editor">Editor</button><iframe id="se2_iframe"></iframe>';
  skin.querySelector('.se2_to_editor').addEventListener('click', () => {
    skin.querySelector('#se2_iframe').contentDocument.body.innerHTML = skin.querySelector('.se2_input_htmlsrc').value;
  });
  const uploads: Array<{ url: string; fields: string[] }> = [];
  vi.stubGlobal('fetch', async (url: string, init: { body: FormData }) => {
    uploads.push({ url, fields: [...(init.body as unknown as { keys(): Iterable<string> }).keys()] });
    return { ok: true, status: 200, json: async () => ({ Val: 'sFileURL=/files/editor/detail.jpg' }) };
  });
  return { page, opened, uploads };
}

const IMAGES = {
  imageGroups: { representative: [loadedImage('rep')], additional: [loadedImage('a1'), loadedImage('a2')] },
  detailImage: loadedImage('detail'),
};

describe('아이스크림몰 사진·상세(KID-256 리뷰 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('대표이미지는 파일 칸, 추가 이미지는 + 로 칸을 늘려 넣고, 상세는 몰 에디터 사진 엔드포인트에 올린 주소로 HTML 탭에 넣는다', async () => {
    const { page, uploads } = loadWithImages();
    const { call, payload } = payloadFor(ICECREAM_MALL_REGISTRATION_FORM, { ...FORM, detailHtmlTarget: 'detailHtmlEditor' }, IMAGES);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector("[name='baseImageFile']").files.map((file: File) => file.name)).toEqual(['rep.jpg']);
    expect(document.querySelector("[name='imgInfo[0][img]']").files.map((file: File) => file.name)).toEqual(['a1.jpg']);
    expect(document.querySelector("[name='imgInfo[1][img]']").files.map((file: File) => file.name)).toEqual(['a2.jpg']);
    expect(uploads).toEqual([{ url: '/common/file/uploadImgEditor.do', fields: ['UPLOAD_FILE'] }]);
    const html = `<center><img src="${dom.window.location.origin}/files/editor/detail.jpg" width="900"></center>`;
    expect(document.querySelector('[name=detailHtmlEditor]').value).toBe(html);
    // 상세 구역 안의 스킨(문서에서 두 번째 iframe)에 넣었다 — 앞의 예스24 스킨은 건드리지 않는다.
    expect(document.querySelector('#skin').contentDocument.querySelector('#se2_iframe').contentDocument.body.innerHTML).toContain('/files/editor/detail.jpg');
    expect(outcome.steps).toEqual(expect.arrayContaining(['대표이미지 1장', '추가이미지 2장', '상세이미지 몰 업로드', '상세설명']));
  });

  it('사진·상세가 실린 채워도 임시저장·등록을 누르지 않는다(KID-237 잠금)', async () => {
    const { page } = loadWithImages();
    const { call, payload } = payloadFor(ICECREAM_MALL_REGISTRATION_FORM, { ...FORM, detailHtmlTarget: 'detailHtmlEditor' }, IMAGES);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
