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

/** node 에는 `FileReader` 가 없다. data URL 로 바꾸는 데만 쓰므로 그만큼만 흉내낸다. */
class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        this.onload?.();
      })
      .catch((error) => this.onerror?.(error));
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
  vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/shared/mall-form-submit-gate.js'), 'utf8'), context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 티처몰(퍼스트몰 selleradmin).
 *
 * 사진에 파일 칸이 없다. 몰 서버에 먼저 올리고 받은 주소를 표에 넣는다
 * (라이브 확인 2026-09-10: 한 번 올리면 일곱 크기가 다 생긴다).
 */
test('사진은 파일 칸이 아니라 몰 서버에 올린다', () => {
  const { SPECS } = loadModule();
  assert.deepEqual(Array.from(SPECS['teacher-mall'].imageSlots), []);
  assert.equal(SPECS['teacher-mall'].imageFileInput, undefined);
  assert.equal(SPECS['teacher-mall'].imageFileInputs, undefined);
  const upload = SPECS['teacher-mall'].imageUpload;
  assert.equal(upload.endpoint, '/selleradmin/goods_process/upload_file_multi');
  assert.equal(upload.field, 'Filedata');
  assert.equal(upload.addButtonId, 'goodsImageAdd');
  assert.equal(upload.tableId, 'goodsImageTable');
  assert.equal(upload.slotSuffix, 'GoodsImage[]');
});

test('크기 목록을 우리가 들고 있지 않는다 — 칸 이름에서 읽는다', () => {
  const { SPECS } = loadModule();
  const upload = SPECS['teacher-mall'].imageUpload;
  // `largeGoodsImage[]` → `large`. 몰이 칸을 늘려도 우리 코드가 따라간다.
  assert.equal('largeGoodsImage[]'.slice(0, -upload.slotSuffix.length), 'large');
  assert.equal('thumbScrollGoodsImage[]'.slice(0, -upload.slotSuffix.length), 'thumbScroll');
});

test('상품정보고시 품목이 방아쇠다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['teacher-mall'].dynamic.trigger, 'goodsSubInfo');
  assert.equal(SPECS['teacher-mall'].dynamic.waitPrefix, 'subInfoTitle[');
});

test('고시 줄이 모자라면 늘린다 — 품목이 만들어 주는 것은 다섯 줄뿐이다', () => {
  const { SPECS } = loadModule();
  const titles = SPECS['teacher-mall'].groupInputs.find((g) => g.key === 'noticeTitles');
  assert.equal(titles.grow.buttonId, 'goodsSubInfoAdd');
  assert.ok(titles.grow.maxClicks >= 39, '실측 등록물이 서른아홉 줄이라 그만큼은 눌러야 한다');
  // 제목도 우리가 써넣는다. 자유 입력 칸이라 품목 기본 이름과 달라도 된다.
  assert.equal(titles.selector, '[name="subInfoTitle[]"]');
  const descs = SPECS['teacher-mall'].groupInputs.find((g) => g.key === 'noticeDescs');
  assert.equal(descs.selector, '[name="subInfoDesc[]"]');
  // 줄을 만드는 것은 한 번이면 된다. 두 번 늘리면 칸이 두 배가 된다.
  assert.equal(descs.grow, undefined);
});

test('분류는 레이어에서 고른 뒤 연결 버튼을 눌러야 폼에 붙는다', () => {
  const { SPECS } = loadModule();
  const connect = SPECS['teacher-mall'].categoryConnect;
  assert.equal(connect.openButtonId, 'categoryConnectPopup');
  assert.equal(connect.formName, 'categoryConnectFrm');
  assert.equal(connect.connectButtonId, 'categoryConnect');
  assert.equal(connect.levelPrefix, 'category');
  assert.equal(connect.levels, 7);
});

test('상세설명은 숨은 칸에 바로 쓴다 — 폼 안에 위지윅이 없다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['teacher-mall'].detailRich, undefined);
  assert.equal(SPECS['teacher-mall'].detailEditor, undefined);
  // 대신 사람이 보는 미리보기 칸을 같이 맞춰 준다.
  assert.equal(SPECS['teacher-mall'].detailPreviewSelector, '#goodscontents_view');
  // 우리 산출물은 로컬 주소라 그대로 넣으면 빈 상세페이지가 된다. 올릴 곳이 있어야 한다.
  assert.equal(SPECS['teacher-mall'].detailHost, 'kidsnote');
});

test('등록화면 주소를 알아본다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['teacher-mall'].origin, 'https://shop.teacherville.co.kr');
  assert.equal(SPECS['teacher-mall'].pathPrefix, '/selleradmin/goods/regist');
  assert.equal(SPECS['teacher-mall'].formSelector, '#goodsRegist');
});

/**
 * 몰 공통 계약.
 *
 * 상세설명을 **HTML 로** 넣는 몰은 몰이 읽을 수 있는 주소를 만들 길이 반드시 있어야
 * 한다. 없으면 넣을 것이 없어 상세설명 단계가 통째로 건너뛰어지고, 상품 설명이 빈
 * 채로 남는데 경고도 나오지 않는다 — 실제로 티처몰에서 이렇게 놓쳤다(2026-09-10).
 */
test('HTML 로 상세설명을 넣는 몰은 전부 올릴 곳을 갖는다', () => {
  const { SPECS } = loadModule();
  for (const [mall, spec] of Object.entries(SPECS)) {
    // ⚠️ 방식을 나열하지 않는다. 예전엔 셋만 적어 뒀는데 새 방식(아이스크림몰의
    // `detailSmartEditor`)이 그대로 빠져나갔다(2026-09-11). 상세설명 칸을 가리키는
    // 손잡이가 하나라도 있으면 HTML 을 넣는 몰이다.
    const writesHtml = Boolean(
      spec.detailPreviewSelector || spec.detailRich || spec.detailEditor
      || spec.detailSmartEditor || spec.detailHtmlTarget || spec.detailSelector,
    );
    if (!writesHtml) continue;
    const canHost = Boolean(spec.detailHost || spec.detailSelfUpload);
    assert.ok(canHost, `${mall} 이 상세설명 HTML 을 넣는데 올릴 곳이 없습니다.`);
  }
});

/**
 * 폼 지시 → 확장이 화면에 넣는 페이로드.
 *
 * 스펙만 보는 시험은 이 사고를 못 잡는다. 웹이 상세설명 이미지를 안 넘기면 확장은
 * 넣을 것이 없어 그 단계를 건너뛰고, 상품 설명이 빈 채로 남는데 경고도 안 나온다.
 * 그래서 실제로 넘어가는 페이로드를 본다.
 */
function harness() {
  const module = loadModule();
  const calls = [];
  const chrome = {
    scripting: {
      executeScript: async (options) => {
        calls.push(options);
        return [{ result: { ok: true, steps: [], warnings: [] } }];
      },
    },
  };
  // 이미지는 읽히기만 하면 된다. 내용은 이 시험의 관심사가 아니다.
  const fetchApi = async () => ({
    ok: true, status: 200,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  });
  const interactiveTabs = { createTab: async () => ({ id: 1 }) };
  const api = module.create({
    chrome, fetch: fetchApi, interactiveTabs, tabReason: 'test',
  });
  return { api, calls };
}

test('상세설명 이미지를 넘기면 상세설명 HTML 이 페이로드에 실린다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'teacher-mall',
    form: {
      url: 'https://shop.teacherville.co.kr/selleradmin/goods/regist',
      fields: { goodsName: '상품' },
      // 이미 몰이 읽을 수 있는 주소면 그대로 쓴다. 실측 등록물이 이 호스팅이다.
      detailUploads: [{ url: 'https://kiditem.diskn.com/2mzzbLYEQe' }],
      detailHtmlTarget: 'contents',
      manualSteps: [],
    },
  });
  const [payload] = calls[0].args;
  assert.equal(payload.detailHtmlTarget, 'contents');
  assert.match(payload.detailHtml, /^<center><img [^>]*src="https:\/\/kiditem\.diskn\.com\/2mzzbLYEQe">/);
  assert.equal(payload.detailPreviewSelector, '#goodscontents_view');
});

test('상세설명 이미지를 빼먹으면 넣을 것이 없다 — 이 사고를 여기서 잡는다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'teacher-mall',
    form: {
      url: 'https://shop.teacherville.co.kr/selleradmin/goods/regist',
      fields: { goodsName: '상품' },
      detailHtmlTarget: 'contents',
      manualSteps: [],
    },
  });
  const [payload] = calls[0].args;
  assert.equal(payload.detailHtml, '');
});

test('상품 사진을 몰 서버에 올리도록 페이로드에 싣는다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'teacher-mall',
    form: {
      url: 'https://shop.teacherville.co.kr/selleradmin/goods/regist',
      fields: { goodsName: '상품' },
      imageGroups: { photos: ['https://kiditem.diskn.com/a', 'https://kiditem.diskn.com/b'] },
      manualSteps: [],
    },
  });
  const [payload] = calls[0].args;
  assert.equal(payload.imageUpload.groupKey, 'photos');
  assert.equal(payload.imageGroups.photos.length, 2);
  for (const image of payload.imageGroups.photos) {
    assert.match(image.dataUrl, /^data:image\/jpeg;base64,/);
  }
});

/**
 * 사진 넣는 단계를 화면째로 흉내내서 돌린다.
 *
 * 페이로드까지만 보는 시험으로는 "표에 실제로 들어갔나"를 못 본다. 사장님이 두 번
 * 연속 "사진이 없는데?" 라고 한 자리라, 여기서는 화면 결과를 본다.
 */
function makeImagePage() {
  const created = [];
  const rows = [];
  const makeRow = () => {
    const slots = ['large', 'view', 'list1', 'list2', 'thumbView', 'thumbCart', 'thumbScroll']
      .map((size) => {
        const view = { className: 'goods' + size + ' view desc',
          classList: {
            remove(...names) { for (const n of names) view.className = view.className.replace(n, '').trim(); },
            add(...names) { view.className = `${view.className} ${names.join(' ')}`.trim(); },
          } };
        const cell = { children: [], querySelector: (s) => (s === 'span.view' ? view : null),
          appendChild(node) { this.children.push(node); } };
        const slot = { name: `${size}GoodsImage[]`, value: '', closest: () => cell };
        cell.slot = slot;
        return slot;
      });
    return { slots, querySelectorAll: () => slots };
  };
  const table = {
    removed: 0,
    emptyRow: null,
    querySelectorAll(selector) {
      // '등록된 사진이 없습니다' 줄. 한 번 지워지면 다시 나오지 않는다.
      if (selector === 'tr.no_goods_image') return table.emptyRow ? [table.emptyRow] : [];
      if (selector === 'tbody tr') return rows;
      return [];
    },
  };
  table.emptyRow = { remove() { table.removed += 1; table.emptyRow = null; } };
  const add = { clicks: 0, click() { this.clicks += 1; rows.push(makeRow()); } };
  const form = { elements: [], querySelectorAll: () => [], querySelector: () => null };
  return {
    rows, table, add, created,
    document: {
      querySelector: (s) => (s === '#goodsRegist' ? form : null),
      getElementById: (id) => (id === 'goodsImageTable' ? table : id === 'goodsImageAdd' ? add : null),
      querySelectorAll: () => [],
      createElement: (tag) => { const node = { tagName: tag, style: {} }; created.push(node); return node; },
    },
  };
}

test('사진이 실제로 표의 일곱 칸에 들어가고 눈으로 보인다', async () => {
  const module = loadModule();
  const page = makeImagePage();
  const payload = {
    formSelector: '#goodsRegist',
    fields: {}, radios: {}, checks: {},
    imageUpload: {
      endpoint: '/selleradmin/goods_process/upload_file_multi', field: 'Filedata',
      groupKey: 'photos', label: '상품 사진', tableId: 'goodsImageTable',
      addButtonId: 'goodsImageAdd', emptyRowSelector: 'tr.no_goods_image',
      slotSuffix: 'GoodsImage[]',
    },
    imageGroups: { photos: [{ fileName: 'a.jpg', dataUrl: 'data:image/jpeg;base64,AQID' }] },
    detailHtmlTarget: '',
  };
  const context = {
    self: {}, console, URL, URLSearchParams, Promise, Date, setTimeout, clearTimeout,
    FormData, Blob, File, atob, Uint8Array, CSS: { escape: (v) => v },
    document: page.document,
    fetch: async () => ({
      status: 200,
      json: async () => [{ status: 1, newFile: '/data/tmp/tmp_abc123', ext: '.jpg' }],
    }),
    window: { alert: () => {} },
  };
  context.globalThis = context;
  context.window.document = page.document;
  vm.createContext(context);
  const run = vm.runInContext(`(${module.pageFunctions.fillMallProductForm.toString()})`, context);
  const outcome = await run(payload);

  assert.equal(outcome.ok, true);
  // 다른 realm 의 배열이라 그대로 비교하면 구조가 같아도 실패한다.
  assert.deepEqual(Array.from(outcome.warnings), []);
  assert.ok(Array.from(outcome.steps).includes('상품 사진 1장'));
  assert.equal(page.add.clicks, 1, "'+' 를 눌러 줄을 만들어야 한다");
  assert.equal(page.table.removed, 1, "'등록된 사진이 없습니다' 줄을 먼저 지워야 한다");
  assert.equal(page.rows.length, 1);
  // 일곱 크기가 각자 제 주소를 갖는다.
  assert.deepEqual(Array.from(page.rows[0].slots.map((slot) => slot.value)), [
    '/data/tmp/tmp_abc123large.jpg', '/data/tmp/tmp_abc123view.jpg',
    '/data/tmp/tmp_abc123list1.jpg', '/data/tmp/tmp_abc123list2.jpg',
    '/data/tmp/tmp_abc123thumbView.jpg', '/data/tmp/tmp_abc123thumbCart.jpg',
    '/data/tmp/tmp_abc123thumbScroll.jpg',
  ]);
  // '보기'가 눌러 볼 수 있게 바뀐다.
  for (const slot of page.rows[0].slots) {
    assert.match(slot.closest().querySelector('span.view').className, /hand blue/);
  }
  // 그리고 사람이 눈으로 볼 그림이 붙는다. 이 몰은 글자 '보기'만 그려서
  // 이게 없으면 채워 놓고도 "사진이 없다"로 보인다.
  const shot = page.created.find((node) => node.className === 'kiditem-shot');
  assert.ok(shot, '사진 미리보기가 붙어야 한다');
  assert.equal(shot.src, '/data/tmp/tmp_abc123view.jpg');
});
