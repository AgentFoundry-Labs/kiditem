// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadedImage, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';
import { TEACHER_MALL_REGISTRATION_FORM } from './sites/teacher-mall/registration';

// 티처몰(`admin-goodsReady.js` 실측 2026-09-10): 상품정보고시 품목을 고르면 그 품목의 줄 다섯이 생기고, 등록물은 서른아홉
// 줄이라 모자란 만큼 '+'(`#goodsSubInfoAdd`)를 눌러 줄을 늘린다. 제목 칸도 자유 입력이다.
const row = () => '<tr><td><input name="subInfoTitle[]"></td><td><input name="subInfoDesc[]"></td></tr>';
const PAGE = `
<form id="goodsRegist">
  <input name="goods_name">
  <select name="goodsSubInfo"><option value="">선택</option><option value="40">(40)기타 재화</option></select>
  <table id="subInfo"></table>
  <button type="button" id="goodsSubInfoAdd">+</button>
  <button type="button">등록</button>
</form>`;

const titles = ['품명 및 모델명', '인증', '제조국', '제조자', 'A/S', '크기', '색상'];
const FORM = {
  url: 'https://shop.teacherville.co.kr/selleradmin/goods/regist',
  fields: { goods_name: '말랑 키링', goodsSubInfo: '40' },
  groups: { noticeTitles: titles, noticeDescs: titles.map((title) => `${title} 값`) },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  const table = document.querySelector('#subInfo');
  document.querySelector('[name=goodsSubInfo]').addEventListener('change', () => {
    table.innerHTML = Array.from({ length: 5 }, row).join('');
  });
  document.querySelector('#goodsSubInfoAdd').addEventListener('click', () => {
    table.insertAdjacentHTML('beforeend', row());
  });
  return page;
}

describe('티처몰 상품등록 폼(KID-256)', () => {
  it('등록 화면 주소만 받는다', () => {
    expect(() => normalizeForm(TEACHER_MALL_REGISTRATION_FORM, { ...FORM, url: 'https://shop.teacherville.co.kr/selleradmin/goods/catalog' })).toThrow('티처몰 상품등록 주소가 아닙니다.');
  });

  it('고시 품목을 골라 줄을 만들고, 모자란 줄은 +로 늘려 제목·값을 순서대로 채운다', async () => {
    const page = load();
    const { call, payload } = payloadFor(TEACHER_MALL_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect([...document.querySelectorAll('[name="subInfoTitle[]"]')].map((el: { value: string }) => el.value)).toEqual(titles);
    expect([...document.querySelectorAll('[name="subInfoDesc[]"]')].map((el: { value: string }) => el.value)).toEqual(titles.map((title) => `${title} 값`));
    expect(outcome.steps).toEqual(expect.arrayContaining(['goodsSubInfo 선택 후 항목 5칸 생성', 'noticeTitles 2줄 추가', 'noticeTitles 7칸']));
  });

  it('등록을 누르지 않는다(KID-237 잠금)', async () => {
    const page = load();
    const { call, payload } = payloadFor(TEACHER_MALL_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});

// 사진(옛 node 스펙 이식): 파일 칸이 없는 몰이다. 사진 하나를 업로드 팝업이 쓰는 엔드포인트에 올리면 서버가 일곱 크기를 만들고,
// '+'로 줄을 만들어 그 줄의 숨은 칸(`<크기>GoodsImage[]`)에 주소를 넣는다.
const SIZES = ['large', 'view', 'list1'];
function loadWithPhotoTable() {
  const page = load();
  const { document } = dom;
  document.querySelector('#goodsRegist').insertAdjacentHTML('beforeend', '<table id="goodsImageTable"><tbody><tr class="no_goods_image"><td>등록된 사진이 없습니다</td></tr></tbody></table><button type="button" id="goodsImageAdd">사진 줄 추가</button>');
  document.querySelector('#goodsImageAdd').addEventListener('click', () => {
    document.querySelector('#goodsImageTable tbody').insertAdjacentHTML('beforeend', `<tr>${SIZES.map((size) => `<td><input type="hidden" name="${size}GoodsImage[]"><span class="view desc">보기</span></td>`).join('')}</tr>`);
  });
  const uploads: Array<{ url: string; field: string; file: string }> = [];
  vi.stubGlobal('fetch', async (url: string, init: { body: FormData }) => {
    const [[field, file]] = [...(init.body as unknown as Iterable<[string, File]>)];
    uploads.push({ url, field: field!, file: file!.name });
    return { ok: true, status: 200, json: async () => [{ status: 1, newFile: `/data/goods/1/20260927${uploads.length}`, ext: '.jpg' }] };
  });
  return { page, uploads };
}

describe('티처몰 사진(KID-256 리뷰 2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('사진마다 업로드 엔드포인트에 올리고 줄을 만들어 크기별 숨은 칸에 주소를 넣으며, 사진이 실려도 등록을 누르지 않는다', async () => {
    const { page, uploads } = loadWithPhotoTable();
    const { call, payload } = payloadFor(TEACHER_MALL_REGISTRATION_FORM, FORM, { imageGroups: { photos: [loadedImage('p1'), loadedImage('p2')] } });

    const outcome = await runPageCall(page, call, payload);

    expect(uploads).toEqual([
      { url: '/selleradmin/goods_process/upload_file_multi', field: 'Filedata', file: 'p1.jpg' },
      { url: '/selleradmin/goods_process/upload_file_multi', field: 'Filedata', file: 'p2.jpg' },
    ]);
    const { document } = dom;
    expect(document.querySelector('tr.no_goods_image')).toBeNull();
    const rows = [...document.querySelectorAll('#goodsImageTable tbody tr')] as Array<{ querySelectorAll(selector: string): ArrayLike<{ value: string }> }>;
    expect(rows.map((row) => Array.from(row.querySelectorAll('input')).map((input) => input.value))).toEqual([
      SIZES.map((size) => `/data/goods/1/202609271${size}.jpg`),
      SIZES.map((size) => `/data/goods/1/202609272${size}.jpg`),
    ]);
    expect(outcome.steps).toEqual(expect.arrayContaining(['상품 사진 2장']));
    expect(page.saves).toEqual([]);
  });
});
