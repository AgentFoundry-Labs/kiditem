import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/mall-form-register.js',
);

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
    }).catch((e) => this.onerror?.(e));
  }
}

function loadModule() {
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
    FileReader: FakeFileReader,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 꼬망세몰(EduPre 임대몰, `nstore.edupre.co.kr`).
 *
 * 실측 2026-09-11, 등록물 `_code=H7984-C3488-G2602`(`전동 오토 버블건 1p …`).
 * 평범한 PHP 폼이라 칸 이름이 다 있지만, 분류·KC·상세설명이 순서와 버튼을 탄다.
 */

function harness() {
  const module = loadModule();
  const calls = [];
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async (options) => {
          calls.push(options);
          return [{ result: { ok: true, steps: [], warnings: [] } }];
        },
      },
    },
    fetch: async () => ({
      ok: true, status: 200,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

const form = (overrides = {}) => ({
  url: 'https://nstore.edupre.co.kr/subAdmin/_product.form.php?_mode=add',
  fields: { _name: '전동오토버블건 1p 비눗방울', _price: '5060', _screenPrice: '8000' },
  radios: { _view: 'Y', _kc_yn: 'Y', p_vat: 'Y' },
  selectorFields: { category1: '278', category2: '279', category3: '288' },
  imageGroups: { square: [], over: [], swipe: [] },
  detailUploads: [],
  manualSteps: [],
  ...overrides,
});

const source = () => readFileSync(modulePath, 'utf8');

test('상품등록 폼 주소만 받는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kkomangse.origin, 'https://nstore.edupre.co.kr');
  assert.equal(SPECS.kkomangse.pathPrefix, '/subAdmin/_product.form.php');
  assert.equal(SPECS.kkomangse.formSelector, 'form[name="frm"]');
});

test('다른 화면 주소는 거절한다', async () => {
  const { api } = harness();
  await assert.rejects(
    () => api.register({ mall: 'kkomangse', form: form({ url: 'https://nstore.edupre.co.kr/subAdmin/_order_product.list.php' }) }),
    /상품등록 주소가 아닙니다/,
  );
});

/**
 * ⭐ KC 번호 칸은 `인증` 을 누르기 전까지 `disabled` 다(실측). 라디오는 원래 칸 뒤에
 * 누르므로, 그대로 두면 번호가 잠긴 칸에 들어가 **제출되지 않는다.**
 */
test('⭐ KC 라디오를 칸보다 먼저 누른다 — 번호 칸이 잠겨 있다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kkomangse.preRadios.join(','), '_kc_yn');

  const { api, calls } = harness();
  await api.register({ mall: 'kkomangse', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.preRadios.join(','), '_kc_yn');

  const code = source();
  const pre = code.indexOf('for (const name of payload.preRadios || [])');
  const fields = code.indexOf('// 3) 나머지 값.');
  assert.ok(pre > 0 && fields > 0 && pre < fields, 'preRadios 가 칸 채우기보다 먼저여야 한다');
});

test('⭐ 분류는 계단식이라 다음 단 목록이 올 때까지 기다린다', () => {
  const { SPECS } = loadModule();
  const keys = SPECS.kkomangse.selectorFields.map((entry) => entry.key).join(',');
  assert.equal(keys, 'category1,category2,category3');
  for (const entry of SPECS.kkomangse.selectorFields) {
    assert.equal(entry.waitForOption, true, `${entry.key} 는 목록을 기다려야 한다`);
  }
  assert.ok(source().includes('if (el.tagName === "SELECT" && entry.waitForOption) {'));
});

/**
 * ⭐⭐ 고르기만 하면 분류가 붙지 않는다. `선택 카테고리 추가` 를 눌러야 이 상품 코드에
 * 분류가 걸린다. 누른 뒤 목록에 `삭제` 줄이 생기는지까지 봐야 반영이 확인된다.
 */
test('⭐⭐ 분류를 고른 뒤 `선택 카테고리 추가` 를 누르고 반영까지 본다', async () => {
  const { SPECS } = loadModule();
  const [click] = SPECS.kkomangse.afterSelectorClicks;
  assert.equal(click.text, '선택 카테고리 추가');
  assert.equal(click.expectSelector, '[onclick*="category_delete"]');
  // 반쯤 고른 분류를 붙이지 않는다.
  assert.equal(click.requireFilled, true);

  const { api, calls } = harness();
  await api.register({ mall: 'kkomangse', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.afterSelectorClicks[0].text, '선택 카테고리 추가');

  const code = source();
  const selectors = code.indexOf('for (const entry of payload.selectorFields || [])');
  const after = code.indexOf('for (const entry of payload.afterSelectorClicks || [])');
  assert.ok(selectors > 0 && after > selectors, '고른 다음에 눌러야 한다');
  assert.ok(code.includes("눌렀는데 반영되지 않았습니다"), '반영이 안 되면 말해야 한다');
});

test('이미지 세 칸은 파일 칸을 집는다 — 같은 이름의 텍스트 칸이 따로 있다', () => {
  const { SPECS } = loadModule();
  const slots = SPECS.kkomangse.imageFileInputs;
  assert.equal(slots.map((slot) => slot.key).join(','), 'square,over,swipe');
  for (const slot of slots) assert.match(slot.selector, /^input\[type="file"\]/);
});

test('이미지를 File 로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'kkomangse',
    form: form({
      imageGroups: {
        square: ['https://cdn.example.com/rep.jpg'],
        over: ['https://cdn.example.com/a1.jpg'],
        swipe: ['https://cdn.example.com/a2.jpg'],
      },
    }),
  });
  const [payload] = calls[0].args;
  for (const key of ['square', 'over', 'swipe']) {
    assert.equal(payload.imageGroups[key].length, 1, `${key} 가 실려야 한다`);
    assert.ok(payload.imageGroups[key][0].dataUrl.startsWith('data:'));
  }
});

/**
 * ⭐ 상세설명은 SmartEditor 2 이고 몰에 사진 업로더가 있다. 표준 샘플이라 파일
 * 바이트를 본문으로 보내고 `sFileURL=` 글자를 받는다(실측 `attach_photo.js`).
 * 남의 호스팅(diskn)에 기대지 않는다 — ESM 에서 그 의존 때문에 등록이 막혔다.
 */
test('⭐ 상세설명은 몰의 에디터 업로더로 올린다 — 남의 호스팅을 쓰지 않는다', async () => {
  const { SPECS } = loadModule();
  const se2 = SPECS.kkomangse.detailSmartEditor;
  assert.equal(se2.anchorId, 'ir1');
  assert.equal(se2.target, '_content');
  assert.equal(se2.upload.mode, 'html5');
  assert.equal(se2.upload.endpoint, '/include/smarteditor2/plugin/photo_uploader/file_uploader_html5.php');
  assert.equal(SPECS.kkomangse.detailHost, undefined);

  const { api, calls } = harness();
  await api.register({
    mall: 'kkomangse',
    form: form({ detailUploads: [{ url: 'https://cdn.example.com/detail.jpg' }] }),
  });
  const [payload] = calls[0].args;
  assert.ok(payload.detailImage?.dataUrl?.startsWith('data:'), '상세 이미지가 File 로 실려야 한다');
});

test('html5 업로드는 파일을 본문으로, 이름·크기·형식은 헤더로 보낸다', () => {
  const code = source();
  assert.ok(code.includes('if (upload.mode === "html5") {'));
  assert.ok(code.includes('"file-name": encodeURIComponent(file.name)'));
  assert.ok(code.includes('"file-size": String(file.size)'));
  assert.ok(code.includes('"file-Type": file.type'));
  // 형식을 거절하면 몰이 `NOTALLOW_` 로 답한다. 조용히 넘기지 않는다.
  assert.ok(code.includes('text.includes("NOTALLOW_")'));
});

/**
 * ⚠️ 같은 화면에 이용안내용 에디터가 하나 더 있다. 문서 전체에서 찾으면 그쪽에 쓴다.
 * textarea(`ir1`)의 부모 칸으로 좁혀야 한다.
 */
test('에디터는 textarea 의 부모 칸에서 찾는다 — 에디터가 둘이다', () => {
  assert.ok(source().includes('(document.getElementById(se2.anchorId)?.parentElement || null)'));
});

test('아이스크림몰 상세 이미지 폭 900 은 그대로다 — 옮기기만 했다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['icecream-mall'].detailSmartEditor.upload.imgWidth, 900);
  assert.equal(SPECS.kkomangse.detailSmartEditor.upload.imgWidth, undefined);
});

test('⭐ 제출하지 않는다 — 저장은 사람이 누른다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'kkomangse', form: form() });
  assert.equal(result.submitted, false);
  assert.equal(result.ok, true);
});

/**
 * ⚠️ 회귀(라이브 2026-09-11): 서버가 PHP Notice 경고문을 응답 **앞에** 찍는다.
 *   `<br /><b>Notice</b>: Only variables should be passed by reference … line 15 …`
 *   `&bNewLine=true&sFileName=…&sFileURL=https://nfile.edupre.co.kr/…jpg&sUploadFile=…`
 * 검증 스크립트가 응답을 300자로 자른 뒤 주소를 찾다가 "업로드 실패" 로 오판했다.
 * 확장은 전체 응답을 `&` 로 쪼개 키가 정확히 `sFileURL` 인 조각만 집어야 한다.
 */
test('⭐ 업로드 응답 앞의 PHP Notice 를 견딘다 — 전체 응답에서 sFileURL 을 찾는다', () => {
  const code = source();
  assert.ok(code.includes('const text = await response.text();'), '응답 전체를 읽어야 한다');
  assert.ok(!/response\.text\(\)\)\.slice\(/.test(code), '응답을 잘라 보면 안 된다');
  assert.ok(code.includes('for (const part of text.split("&")) {'));
  assert.ok(code.includes('part.slice(0, at) === "sFileURL"'), '키가 정확히 sFileURL 인 조각만 집는다');

  // 실제 응답 모양으로 같은 해석을 돌려 본다.
  const sample = '<br />\n<b>Notice</b>:  Only variables should be passed by reference in <b>/x.php</b> on line <b>15</b><br />\n'
    + '&bNewLine=true&sFileName=a.jpg&sFileURL=https://nfile.edupre.co.kr/nstore/upfiles/smarteditor/2026/09/x.jpg&sUploadFile=x.jpg';
  let hosted = '';
  for (const part of sample.split('&')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at) === 'sFileURL') hosted = part.slice(at + 1).trim();
  }
  assert.equal(hosted, 'https://nfile.edupre.co.kr/nstore/upfiles/smarteditor/2026/09/x.jpg');
});

/**
 * ⭐ 상세 이미지 1 은 상품 페이지의 큰 사진이라 대표가 들어간다(매장 화면 실측). 추가
 * 썸네일은 `추가`(`a.js_addimg_btn`)로 칸을 늘려 상세 2~5 에 넣는다. 화면이 칸을 붙일
 * 때마다 `rename_img()` 로 파일 칸 이름을 순서대로 `_img_b1~5` 로 다시 매긴다.
 */
test('⭐ 상세 2~5 는 `추가` 로 칸을 늘려 넣는다 — 1번 뒤부터', () => {
  const repeat = loadModule().SPECS.kkomangse.imageRepeat;
  assert.equal(repeat.groupKey, 'gallery');
  assert.equal(repeat.anchorSelector, 'input[type="file"][name="_img_b1"]');
  assert.equal(repeat.sectionClosest, '.in_option_list');
  assert.equal(repeat.addSelector, 'a.js_addimg_btn');
  assert.equal(repeat.namePattern, '_img_b{n}');
  assert.equal(repeat.firstIndex, 2);
  // 다섯 칸을 넘기면 화면이 alert 를 띄운다. 1번이 이미 있으니 넷까지만 늘린다.
  assert.equal(repeat.max, 4);
});

test('상세 2~5 사진도 File 로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'kkomangse',
    form: form({
      imageGroups: {
        square: ['https://cdn.example.com/rep.jpg'],
        over: [],
        swipe: ['https://cdn.example.com/rep.jpg'],
        gallery: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
      },
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.imageRepeat.groupKey, 'gallery');
  assert.equal(payload.imageGroups.gallery.length, 2);
  assert.ok(payload.imageGroups.gallery[0].dataUrl.startsWith('data:'));
});

test('칸 늘리기는 있는 칸을 세고 모자란 만큼만 누른다 — 파일 칸만 집는다', () => {
  const code = source();
  assert.ok(code.includes('const base = first > 1 ? first - 1 : 0;'));
  assert.ok(code.includes('for (let i = slots(); i < base + want; i += 1) add.click();'));
  assert.ok(code.includes('.replace("{n}", String(first + i));'));
  // 꼬망세는 같은 이름의 글자 칸(외부 주소용)이 있어 파일 칸만 집어야 한다.
  assert.ok(code.includes('section.querySelector(`input[type="file"][name="${name}"]`)'));
});
