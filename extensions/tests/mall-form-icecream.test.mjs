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
 * 아이스크림몰.
 *
 * 실측 2026-09-11(등록물 `goodsNo=11411122`). 이 몰만 다른 것 셋을 지킨다 —
 * 폼이 열한 개, 고시가 분류로 안 열림, 상세가 SmartEditor 2.
 */
test('상품등록 주소만 받는다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS['icecream-mall'];
  assert.equal(spec.origin, 'https://po.i-screammall.co.kr');
  assert.equal(spec.pathPrefix, '/goods/temporaryGeneralGoods');
  assert.equal(spec.multiForm, true);
});

test('⭐ 고시를 여는 함수 이름은 몰의 오타 그대로다', () => {
  // `Annoucement` — n 하나가 빠져 있다. 고치면 함수를 못 찾는다.
  const { SPECS } = loadModule();
  assert.equal(SPECS['icecream-mall'].noticeSection.open, 'getAnnoucementItemInfo');
  assert.equal(SPECS['icecream-mall'].noticeSection.owner, 'announcementInfo');
  assert.equal(SPECS['icecream-mall'].noticeSection.tableId, 'announcementInfoTable');
});

test('분류는 코드와 경로 두 칸 모두를 쓴다', () => {
  const { SPECS } = loadModule();
  // 경로만 맞춰 두면 화면은 맞아 보이는데 저장이 빈 분류로 들어간다.
  // vm 안에서 만들어진 객체라 deepEqual 은 realm 이 달라 실패한다. 필드로 본다.
  assert.equal(SPECS['icecream-mall'].categoryFields.code, 'stdCtgNo');
  assert.equal(SPECS['icecream-mall'].categoryFields.path, 'stdCtgHierarchy');
});

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
  const api = module.create({
    chrome,
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }) }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

const form = (overrides = {}) => ({
  url: 'https://po.i-screammall.co.kr/goods/temporaryGeneralGoods.temporaryGeneralGoodsView.do',
  formFields: {
    goodsInfo: { goodsNm: '슈가 귤 쫀득 쫀뜩 주물럭 1p' },
    priceInfo: { supPcost: '1950', norPrc: '4000', salePrc: '2600', mrgnRate: '25' },
  },
  category: { code: 'BC0105010200', path: '아이스크림몰>학급운영>학생선물>장난감/완구' },
  notice: {
    itemCode: '023',
    safeCertiTgtYn: 'Y',
    kcCertified: 'Y',
    rows: [{ title: '크기, 중량', value: '8x8x7cm' }, { title: '색상', value: '오렌지' }],
  },
  manualSteps: [],
  ...overrides,
});

test('폼 id 별 칸을 그대로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'icecream-mall', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.multiFormFields.priceInfo.supPcost, '1950');
  assert.equal(payload.multiFormFields.goodsInfo.goodsNm, '슈가 귤 쫀득 쫀뜩 주물럭 1p');
});

test('분류 코드와 경로를 함께 넘긴다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'icecream-mall', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.categoryCode, 'BC0105010200');
  assert.match(payload.categoryPath, /학급운영/);
});

test('고시는 품목코드·안전여부·줄을 함께 넘긴다 — 코드가 없으면 행이 안 열린다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'icecream-mall', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.noticeItemCode, '023');
  assert.equal(payload.noticeSafeYn, 'Y');
  assert.equal(payload.noticeRows.length, 2);
  assert.equal(payload.noticeRadios['072'], 'Y');
  assert.equal(payload.noticeRadios.safeCertiTgtYn, 'Y');
});

test('안전인증 대상이 아니면 N 으로 간다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({ notice: { itemCode: '023', safeCertiTgtYn: 'N', kcCertified: 'N', rows: [] } }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.noticeSafeYn, 'N');
});

test('제목 없는 고시 줄은 버린다 — 못 찾을 칸을 만들지 않는다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({ notice: { itemCode: '023', safeCertiTgtYn: 'N', rows: [{ title: '', value: 'x' }, { value: 'y' }] } }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.noticeRows.length, 0);
});

test('⭐ 이미지는 그룹 방식 파일칸으로 간다 — 단수 방식은 imageUrls 를 봐서 통째로 빠졌다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS['icecream-mall'];
  // `imageFileInput`(단수)은 `form.imageUrls` 를 읽는데 이 몰 빌더는 `imageGroups` 로 보낸다.
  assert.equal(spec.imageFileInput, undefined);
  assert.equal(spec.imageFileInputs.length, 1);
  assert.equal(spec.imageFileInputs[0].key, 'representative');
  assert.equal(spec.imageFileInputs[0].selector, "input[name='baseImageFile']");
});

test('대표이미지를 그룹으로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({ imageGroups: { representative: ['https://cdn.example.com/rep.jpg'] } }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.imageGroups.representative.length, 1);
  assert.ok(payload.imageGroups.representative[0].dataUrl.startsWith('data:'));
  assert.equal(payload.imageFileInputs[0].key, 'representative');
});

test('⭐ SmartEditor 는 구역 안에서 찾는다 — 스킨 iframe 이 둘이라 순서로 집으면 예스24 쪽이다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['icecream-mall'].detailSmartEditor.section, 'detailInfo');
  assert.equal(SPECS['icecream-mall'].detailSmartEditor.target, 'detailHtmlEditor');
});

test('⭐⭐ SmartEditor 에는 HTML 탭으로 넣는다 — 편집면에 직접 쓰면 되돌려진다', () => {
  // 라이브 실측 2026-09-11: `body.innerHTML` 에 쓰면 77자 → 1초 뒤 11자(`<p><br></p>`).
  // 사람이 하는 순서(HTML 탭 → 소스 붙여넣기 → Editor 복귀)만 7초 뒤에도 남았다.
  const se2 = loadModule().SPECS['icecream-mall'].detailSmartEditor;
  assert.equal(se2.toSourceSelector, 'button.se2_to_html');
  assert.equal(se2.sourceSelector, 'textarea.se2_input_htmlsrc');
  assert.equal(se2.toEditorSelector, 'button.se2_to_editor');
});

test('상세설명 설정을 주입 인자로 넘긴다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({
      detailUploads: [{ url: 'https://kiditem.diskn.com/x80sp01Z4m' }],
      detailHtmlTarget: 'detailHtmlEditor',
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.detailSmartEditor.section, 'detailInfo');
  assert.match(payload.detailHtml, /kiditem\.diskn\.com/);
});

test('상세설명은 SmartEditor 뒷단 textarea 로 간다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({
      detailUploads: [{ url: 'https://kiditem.diskn.com/x80sp01Z4m' }],
      detailHtmlTarget: 'detailHtmlEditor',
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.detailHtmlTarget, 'detailHtmlEditor');
  assert.match(payload.detailHtml, /<img [^>]*src="https:\/\/kiditem\.diskn\.com\/x80sp01Z4m"/);
});

test('⭐ 상세설명 이미지를 올릴 곳이 있다 — 없으면 조용히 빈 채로 등록된다', () => {
  const { SPECS } = loadModule();
  // 우리 산출물은 로컬 MinIO 주소라 몰이 못 읽는다. 실측 등록물도 diskn 주소였다.
  assert.equal(SPECS['icecream-mall'].detailHost, 'kidsnote');
});

test('⭐ 상세이미지는 몰 서버에 올린다 — 에디터 사진 버튼이 쓰는 그 엔드포인트', () => {
  // 실측 2026-09-11: attach_photo.js → POST /common/file/uploadImgEditor.do,
  // 칸 이름 UPLOAD_FILE, 응답 {Val:"sFileURL=/files/editor/…"}.
  const se2 = loadModule().SPECS['icecream-mall'].detailSmartEditor;
  assert.equal(se2.upload.endpoint, '/common/file/uploadImgEditor.do');
  assert.equal(se2.upload.field, 'UPLOAD_FILE');
});

test('⭐ 추가 이미지는 칸을 늘려 가며 넣는다 — 처음엔 칸이 없다', () => {
  const repeat = loadModule().SPECS['icecream-mall'].imageRepeat;
  assert.equal(repeat.addLabel, '+');
  assert.equal(repeat.namePattern, 'imgInfo[{i}][img]');
  assert.equal(repeat.groupKey, 'additional');
  assert.equal(repeat.max, 9); // 몰 안내: 추가 이미지는 9개까지
});

test('⭐ 추가 이미지도 내려받아 실어 보낸다 — 안 그러면 칸만 생기고 빈 채로 남는다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({
      imageGroups: {
        representative: ['https://cdn.example.com/rep.jpg'],
        additional: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
      },
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.imageGroups.additional.length, 2);
  assert.ok(payload.imageGroups.additional[0].dataUrl.startsWith('data:'));
  assert.equal(payload.imageRepeat.groupKey, 'additional');
});

test('⭐ 상세이미지를 File 로 실어 보낸다 — 몰 업로드의 전제다', async () => {
  // 이게 없으면 몰에 올릴 것이 없어 상세설명이 빈 채로 남는다.
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({
      detailUploads: [{ url: 'https://kiditem.diskn.com/x80sp01Z4m' }],
      detailHtmlTarget: 'detailHtmlEditor',
    }),
  });
  const [payload] = calls[0].args;
  assert.ok(payload.detailImage?.dataUrl?.startsWith('data:'), '상세이미지가 실려야 한다');
  assert.ok(payload.detailSelfUpload, 'File 로 받아 오도록 켜져 있어야 한다');
});

test('폼별 라디오·체크박스도 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'icecream-mall',
    form: form({
      formRadios: { saleInfo: { stkMgrYn: 'N' }, deliveryInfo: { cmbDeliYn: 'Y' } },
      formChecks: { priceInfo: { 'payWayCd[]': ['11', '12', '32'] } },
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.multiFormRadios.saleInfo.stkMgrYn, 'N');
  assert.equal(payload.multiFormRadios.deliveryInfo.cmbDeliYn, 'Y');
  assert.equal(payload.multiFormChecks.priceInfo['payWayCd[]'].length, 3);
});

test('제출하지 않는다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'icecream-mall', form: form() });
  assert.equal(result.submitted, false);
  assert.equal(result.ok, true);
});

test('다른 몰 주소는 거절한다', async () => {
  const { api } = harness();
  await assert.rejects(
    () => api.register({ mall: 'icecream-mall', form: form({ url: 'https://shop.teacherville.co.kr/selleradmin/goods/regist' }) }),
    /상품등록 주소가 아닙니다/,
  );
});
