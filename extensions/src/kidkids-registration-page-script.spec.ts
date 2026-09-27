// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import { KIDKIDS_REGISTRATION_FORM } from './sites/kidkids/registration';
import { normalizeForm } from './sites/mall-write/form';
import { dom, loadedImage, loadWritePage, payloadFor, runPageCall } from './sites/mall-write/write-page.fake';

// 키드키즈 파트너센터(실측 2026-09-14, 폼은 iframe 주소 `/sales/goods_reg_renewal.htm`을 바로 연다): 공정위 고시 줄은 이름이
// 모두 `spec_contents`라 `info` 속성으로 가리고, 고시 분류를 고른 뒤에야 그려진다. 글자 수 표시는 keyup으로만 바뀐다.
const PAGE = `
<form name="goods_form">
  <input name="goods_name" id="goods_name">
  <select id="gs_id"><option value="">선택</option><option value="35">완구</option></select>
  <div id="spec"></div>
  <input type="radio" name="kc_view" value="N" checked><input type="radio" name="kc_view" value="Y">
  <button type="button" onclick="go_update()">등록</button>
</form>`;

const FORM = {
  url: 'https://partner.kidkids.net/sales/goods_reg_renewal.htm',
  fields: { goods_name: '애니멀 회전 주사위 키링' },
  radios: { kc_view: 'Y' },
  selectorFields: { noticeGroup: '35' },
  infoRows: { 373: '3500애니멀회전주사위키링', 374: '중국' },
  manualSteps: [],
};

function load() {
  const page = loadWritePage(PAGE, [guardSource, fillSource]);
  const { document } = dom;
  const keyups: string[] = [];
  document.querySelector('#goods_name').addEventListener('keyup', () => keyups.push('goods_name'));
  // 고시 분류를 고르면 고시 줄이 늦게 그려진다(`goods_spec_proc.php`).
  document.querySelector('#gs_id').addEventListener('change', () => setTimeout(() => {
    document.querySelector('#spec').innerHTML = '<textarea class="spec_contents" name="spec_contents" info="373"></textarea><textarea class="spec_contents" name="spec_contents" info="374"></textarea>';
  }, 1_500));
  return { page, keyups };
}

describe('키드키즈 상품등록 폼(KID-256)', () => {
  it('등록 폼 iframe 주소만 받는다 — 겉 껍데기·목록에 값을 넣지 않는다', () => {
    for (const url of ['https://partner.kidkids.net/new/pages/sales/goods_register.htm', 'https://partner.kidkids.net/sales/goods_list.htm']) {
      expect(() => normalizeForm(KIDKIDS_REGISTRATION_FORM, { ...FORM, url })).toThrow('키드키즈 상품등록 주소가 아닙니다.');
    }
  });

  it('고시 분류를 고른 뒤 그려지는 줄을 info 속성으로 가려 넣고, 칸마다 keyup도 준다', async () => {
    const { page, keyups } = load();
    const { call, payload } = payloadFor(KIDKIDS_REGISTRATION_FORM, FORM);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect([...document.querySelectorAll('textarea.spec_contents')].map((el: { value: string }) => el.value)).toEqual(['3500애니멀회전주사위키링', '중국']);
    expect(outcome.steps).toEqual(expect.arrayContaining(['공정위 고시 분류', '공정위 고시 2줄']));
    expect(keyups).toContain('goods_name');
    expect(document.querySelector('[name=kc_view]:checked').value).toBe('Y');
  });

  it('등록(go_update)을 누르지 않고 폼을 보내지 않는다(KID-237 잠금)', async () => {
    const { page } = load();
    const { call, payload } = payloadFor(KIDKIDS_REGISTRATION_FORM, FORM);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
    expect(fillSource).not.toMatch(/go_update\(/);
  });
});

// 사진·상세(옛 node 스펙 `mall-form-kidkids` 이미지·상세 절 이식): 목록·추가 이미지는 칸마다 한 장씩 파일 칸에, 상세는 TinyMCE —
// 에디터 [...] 업로드 창의 엔드포인트(`galery_ftp.htm`)에 올리고, 응답 화면에 실린 새 파일 주소로 넣는다(올린 파일명으로 찾지 않는다).
function loadWithImages(answer: string) {
  const { page } = load();
  const { document } = dom;
  document.querySelector('form[name=goods_form]').insertAdjacentHTML('beforeend', '<input type="file" name="goods_photo_new"><input type="file" name="goods_img_2"><textarea name="goods_desc" id="goods_desc"></textarea>');
  const editor = { content: '', allowed: '', setContent(html: string) { this.content = html; }, schema: { addValidElements(rule: string) { editor.allowed = rule; } } };
  const saved: string[] = [];
  dom.window.tinyMCE = { get: (id: string) => (id === 'goods_desc' ? editor : null), triggerSave: () => saved.push(editor.content) };
  const uploads: Array<{ url: string; file: string; fields: Array<[string, string]> }> = [];
  vi.stubGlobal('fetch', async (url: string, init: { body: FormData }) => {
    const entries = [...(init.body as unknown as Iterable<[string, unknown]>)];
    const file = entries.find(([name]) => name === 'upload')?.[1] as File;
    uploads.push({ url, file: file.name, fields: entries.filter(([name]) => name !== 'upload') as Array<[string, string]> });
    return { ok: true, status: 200, text: async () => answer };
  });
  return { page, editor, saved, uploads };
}

const IMAGES = { imageGroups: { main: [loadedImage('main')], img2: [loadedImage('second')] }, detailImage: { ...loadedImage('detail'), fileName: 'detail' } };
const UPLOADED = "<script>function insertimg(){ parent.set('https://img.kidkids.net/upimage/'); parent.set('https://img.kidkids.net/upimage/20260927153012_4821.jpg'); }</script>";

describe('키드키즈 사진·상세(KID-256 리뷰 2)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete dom.window.tinyMCE;
  });

  it('칸마다 한 장씩 넣고, 상세는 몰 업로드 창에 올린 새 주소로 TinyMCE에 넣는다 — 확장자 없는 파일명은 붙여 올린다', async () => {
    const { page, editor, saved, uploads } = loadWithImages(UPLOADED);
    const { call, payload } = payloadFor(KIDKIDS_REGISTRATION_FORM, { ...FORM, detailHtmlTarget: 'goods_desc' }, IMAGES);

    const outcome = await runPageCall(page, call, payload);

    const { document } = dom;
    expect(document.querySelector('[name=goods_photo_new]').files.map((file: File) => file.name)).toEqual(['main.jpg']);
    expect(document.querySelector('[name=goods_img_2]').files.map((file: File) => file.name)).toEqual(['second.jpg']);
    expect(uploads).toEqual([{
      url: '/sales/js/tiny_mce/plugins/advimage/galery_ftp.htm?dirname=https://img.kidkids.net/upimage/',
      file: 'detail.jpg',
      fields: [['act', 'upload'], ['fname', '']],
    }]);
    expect(editor.content).toBe('<center><img src="https://img.kidkids.net/upimage/20260927153012_4821.jpg"></center>');
    expect(editor.allowed).toContain('referrerpolicy');
    expect(saved).toEqual([editor.content]);
    expect(outcome.steps).toEqual(expect.arrayContaining(['대표 이미지 1장', '추가 이미지 2 1장', '상세이미지 몰 업로드', '상세설명(에디터)']));
  });

  it('응답에 올린 파일 주소가 없으면 기본 주소를 넣지 않고 까닭을 말한다', async () => {
    const { page, editor } = loadWithImages("<script>parent.set('https://img.kidkids.net/upimage/');</script>");
    const { call, payload } = payloadFor(KIDKIDS_REGISTRATION_FORM, { ...FORM, detailHtmlTarget: 'goods_desc' }, IMAGES);
    const outcome = await runPageCall(page, call, payload);
    expect(editor.content).toBe('');
    expect(outcome.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('상세이미지를 몰에 올리지 못했습니다'),
      '상세설명에 넣을 이미지를 만들지 못했습니다. 화면에서 직접 넣으세요.',
    ]));
  });

  it('사진·상세가 실린 채워도 등록(go_update)을 누르지 않는다(KID-237 잠금)', async () => {
    const { page } = loadWithImages(UPLOADED);
    const { call, payload } = payloadFor(KIDKIDS_REGISTRATION_FORM, { ...FORM, detailHtmlTarget: 'goods_desc' }, IMAGES);
    await runPageCall(page, call, payload);
    expect(page.saves).toEqual([]);
  });
});
