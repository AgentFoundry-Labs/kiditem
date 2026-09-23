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
  vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/shared/mall-form-submit-gate.js'), 'utf8'), context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * ESM Plus(G마켓 · 옥션).
 *
 * 실측 2026-09-11(빈 폼 `item.esmplus.com/goods/new` + 등록물 `goodsNo=6548340498`).
 *
 * 이 몰은 지금까지 붙인 여덟 몰과 근본이 다르다 — **`<form>` 도 `name` 도 `id` 도 없다.**
 * `id` 는 React `useId` 가 만든 `:r0:` 이라 렌더마다 바뀌고, 네이티브 `<select>` 는
 * 문서에 하나도 없다. 유일한 손잡이가 화면에 찍힌 **섹션 제목**이다.
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
  const api = module.create({
    chrome,
    fetch: async () => ({
      ok: true,
      status: 200,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      json: async () => ({ url: 'https://kiditem.diskn.com/hosted' }),
      text: async () => 'https://kiditem.diskn.com/hosted',
    }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

const form = (overrides = {}) => ({
  url: 'https://item.esmplus.com/goods/new',
  sectionFields: {
    상품명: '할로윈 LED 거미줄 1p 불빛 장식',
    판매가: '2590',
    재고수량: '999',
    '반품/교환 배송비(편도)': '3000',
    '크기/중량': '90x90cm',
  },
  // 실측: 빈 폼에서 `어린이제품 인증` 만 `인증대상` 으로 열린다. 생활용품·전기용품은
  // 이미 `인증대상이 아님` 이라 건드리지 않는다.
  sectionRadios: { '어린이제품 인증': '상세설명에 별도표기' },
  sectionDropdowns: { 상품군: '어린이제품' },
  category: { query: '기타이벤트', path: '이벤트/파티용품>기타이벤트/파티용품' },
  images: [],
  detailUploads: [],
  manualSteps: [],
  ...overrides,
});

test('껍데기가 아니라 폼 주소를 받는다 — 도메인이 다르다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.gmarket.origin, 'https://item.esmplus.com');
  assert.equal(SPECS.gmarket.pathPrefix, '/goods/new');
});

test('다른 몰 주소는 거절한다', async () => {
  const { api } = harness();
  await assert.rejects(
    () => api.register({ mall: 'gmarket', form: form({ url: 'https://www.esmplus.com/Home/v2/goods-register' }) }),
    /상품등록 주소가 아닙니다/,
  );
});

test('⭐ 섹션 제목으로 찾는 손잡이를 넘긴다 — 이 몰은 name 도 id 도 없다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.sectionLayout.itemSelector, 'div.box__filter-item');
  assert.equal(payload.sectionLayout.headSelector, '.box__filter-head');
  assert.equal(payload.sectionLayout.contentSelector, '.box__filter-content');
});

test('⭐ 드롭다운은 li 가 아니라 button 을 누른다 — li 클릭은 아무 일도 안 일어난다', () => {
  // 라이브 실측 2026-09-11: `li.list-item` 을 눌렀을 때 선택이 안 됐고,
  // 그 안의 `button.button__option` 을 누르니 됐다.
  const { SPECS } = loadModule();
  assert.equal(SPECS.gmarket.sectionForm.optionSelector, 'button.button__option');
  assert.equal(SPECS.gmarket.sectionForm.openerSelector, 'button.button__opener');
});

test('섹션 칸·라디오·드롭다운 값을 그대로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.sectionFields.상품명, '할로윈 LED 거미줄 1p 불빛 장식');
  assert.equal(payload.sectionFields['반품/교환 배송비(편도)'], '3000');
  assert.equal(payload.sectionRadios['어린이제품 인증'], '상세설명에 별도표기');
  assert.equal(payload.sectionDropdowns.상품군, '어린이제품');
});

test('분류는 검색어와 전체 경로 둘 다 넘긴다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.sectionCategory.query, '기타이벤트');
  assert.equal(payload.sectionCategory.path, '이벤트/파티용품>기타이벤트/파티용품');
  assert.equal(payload.sectionLayout.category.searchButton, 'button.button__search');
});

test('분류 경로가 없으면 분류를 건드리지 않는다 — 엉뚱한 곳에 넣지 않는다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form({ category: null }) });
  const [payload] = calls[0].args;
  assert.equal(payload.sectionCategory, null);
});

/**
 * ⚠️ 회귀(아이스크림몰에서 같은 실수로 이미지가 통째로 빠졌다, 라이브 2026-09-11):
 * `imageGroups` 는 `imageSlotSpecs` 에 등록된 키만 내려받는다. 빌더가 보내는
 * `images` 한 줄을 그 그룹으로 옮겨 두지 않으면 칸만 있고 이미지가 안 들어간다.
 */
test('⭐ 이미지를 File 로 실어 보낸다 — 칸 하나에 여러 장이라 한 번에 간다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'gmarket',
    form: form({
      images: [
        'https://cdn.example.com/rep.jpg',
        'https://cdn.example.com/a1.jpg',
        'https://cdn.example.com/a2.jpg',
      ],
    }),
  });
  const [payload] = calls[0].args;
  const loaded = payload.imageGroups.esmplus;
  assert.equal(loaded.length, 3, '세 장 모두 실려야 한다');
  assert.ok(loaded[0].dataUrl.startsWith('data:'));
  assert.equal(payload.sectionLayout.images.groupKey, 'esmplus');
  assert.equal(payload.sectionLayout.images.max, 15);
});

test('이미지가 없으면 빈 채로 둔다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.imageGroups.esmplus, undefined);
});

test('⭐ 상세설명은 에디터가 아니라 HTML 작성 탭이다 — 에디터에 쓰면 저장할 때 덮인다', () => {
  const { SPECS } = loadModule();
  const detail = SPECS.gmarket.sectionDetail;
  assert.equal(detail.tabLabel, 'HTML 작성');
  assert.equal(detail.textareaSelector, 'textarea.box__board-textarea');
  // SmartEditor 도 iframe 도 아니다. 다른 몰의 손잡이를 끌어오지 말 것.
  assert.equal(SPECS.gmarket.detailSmartEditor, undefined);
  assert.equal(SPECS.gmarket.detailRich, undefined);
});

/**
 * ⭐⭐ 사장님 지적 2026-09-11: "esm 인데 왜 키즈노트를 쓰냐고 여기에 맞게 해야지"
 *
 * 예전엔 상세 이미지를 키즈노트(diskn)에 먼저 올려 주소를 받아 HTML 로 넣었다.
 * 그런데 키즈노트 로그인이 풀리자 ESM 등록이 통째로 막혔다(라이브: "상품번호를 받지
 * 못했습니다"). **남의 몰 세션에 우리 등록을 걸어 두지 않는다.**
 */
test('⭐⭐ 상세설명을 ESM 에 직접 올린다 — 키즈노트에 기대지 않는다', async () => {
  const { SPECS } = loadModule();
  const spec = SPECS.gmarket;
  assert.equal(spec.detailHost, undefined, '남의 몰 호스팅에 기대면 안 된다');
  assert.ok(spec.detailSelfUpload, '상세 이미지를 File 로 받아 와야 한다');
  assert.equal(spec.sectionDetail.uploadTabLabel, '이미지 업로드');
  // ⚠️ 파일 칸 이름이 상품이미지와 같은 `btnSelectFile` 이다. 보드 안에서 찾아야 한다.
  assert.equal(spec.sectionDetail.uploadBoardSelector, 'div.box__board');
  assert.equal(spec.sectionDetail.uploadFileSelector, 'input.form__file');

  const { api, calls } = harness();
  await api.register({
    mall: 'gmarket',
    form: form({ detailUploads: [{ url: 'https://cdn.example.com/detail.jpg' }] }),
  });
  const [payload] = calls[0].args;
  assert.ok(payload.detailImage?.dataUrl?.startsWith('data:'), '상세 이미지가 File 로 실려야 한다');
});

test('업로드가 끝났는지 안내 문구로 확인한다 — 고정 시간으로 자르지 않는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.gmarket.sectionDetail.uploadDoneText, '등록된 이미지가 있습니다');
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(source.includes('text.includes(detailSpec.uploadDoneText)'), '올라간 것을 확인해야 한다');
});

test('배송 값은 실어 보내지 않는다 — 빈 폼이 계정 템플릿으로 차 있다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  for (const key of ['택배사', '발송정책', '출고지', '배송비 선택', '반품 교환지']) {
    assert.equal(payload.sectionFields[key], undefined, `${key} 는 건드리지 않는다`);
    assert.equal(payload.sectionDropdowns[key], undefined, `${key} 는 건드리지 않는다`);
  }
});

test('⭐ 제출하지 않는다 — 한 번에 몰 둘이라 더더욱 사람이 봐야 한다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'gmarket', form: form() });
  assert.equal(result.submitted, false);
  assert.equal(result.ok, true);
});

/**
 * ⚠️ 회귀 방지 — **몰 SPEC 을 더하고 호스트 권한을 빼먹는 실수.**
 *
 * `chrome.scripting.executeScript` 는 `host_permissions` 에 없는 주소에서 그냥
 * 실패한다. 화면에는 "폼 채움 결과를 받지 못했습니다" 로만 보여서 원인이 안 보인다.
 * 카카오(주문수집)에서 같은 이유로 한 번 막혔다.
 *
 * ESM Plus 하나만 보지 않고 **등록 SPEC 전부**를 본다 — 다음 몰에서 또 빼먹지 않게.
 */
test('⭐ 모든 몰 SPEC 의 origin 이 manifest host_permissions 에 있다', () => {
  const { SPECS } = loadModule();
  const manifest = JSON.parse(
    readFileSync(path.join(repoRoot, 'extensions/kiditem-os/manifest.json'), 'utf8'),
  );
  const patterns = manifest.host_permissions || [];
  const covers = (origin) => {
    const host = new URL(origin).hostname;
    return patterns.some((pattern) => {
      const match = /^https?:\/\/([^/]+)\//.exec(pattern);
      if (!match) return false;
      const rule = match[1];
      if (rule === host) return true;
      // `https://*.example.com/*` 는 example.com 과 그 하위를 덮는다.
      if (rule.startsWith('*.')) {
        const base = rule.slice(2);
        return host === base || host.endsWith(`.${base}`);
      }
      return false;
    });
  };
  const missing = Object.entries(SPECS)
    .filter(([, spec]) => spec.origin)
    .filter(([, spec]) => !covers(spec.origin))
    .map(([mall, spec]) => `${mall} (${spec.origin})`);
  assert.deepEqual(missing, [], `host_permissions 에 빠진 몰: ${missing.join(', ')}`);
});

/**
 * ⭐⭐ 회귀(라이브 2026-09-11) — **분류가 인증 칸의 방아쇠다.**
 *
 * 분류를 고르면 `인증정보` 패널이 어린이제품 · G마켓 인증정보 · G마켓 영업허가증으로
 * **다시 그려지고 기본값이 `인증대상`/`허가 대상` 으로 되돌아간다.** 인증 라디오를
 * 분류보다 먼저 누르면 눌러 둔 값이 **지워진다** — 화면은 채워진 것처럼 보이는데
 * 등록을 누르면 `인증 유형`·`업종` 이 비어 막힌다.
 *
 * 주입 함수는 페이지 안에서만 도는 코드라 여기서 실행할 수 없다. 대신 **소스의 순서**를
 * 잠근다 — 누가 블록을 옮기면 여기서 걸린다.
 */
test('⭐⭐ 분류를 인증 라디오보다 먼저 한다 — 반대로 하면 인증이 지워진다', () => {
  const source = readFileSync(modulePath, 'utf8');
  const category = source.indexOf('const wantCategory = payload.sectionCategory;');
  const radios = source.indexOf('Object.entries(payload.sectionRadios || {})');
  const dropdowns = source.indexOf('Object.entries(payload.sectionDropdowns || {})');
  const fields = source.indexOf('Object.entries(payload.sectionFields || {})');
  assert.ok(category > 0 && radios > 0 && dropdowns > 0 && fields > 0, '네 블록이 모두 있어야 한다');
  assert.ok(category < radios, '분류가 인증 라디오보다 먼저여야 한다');
  // `상품군` 을 골라야 고시 15줄이 그려진다. 칸 채우기가 드롭다운보다 뒤여야 한다.
  assert.ok(dropdowns < fields, '드롭다운(상품군)이 칸 채우기보다 먼저여야 한다');
});

test('⭐ 분류에 따라 없을 수 있는 칸은 경고하지 않는다 — 거짓 경보가 진짜를 묻는다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'gmarket',
    form: form({ optionalSections: ['어린이제품 인증', 'G마켓 영업허가증'] }),
  });
  const [payload] = calls[0].args;
  assert.deepEqual(payload.optionalSections, ['어린이제품 인증', 'G마켓 영업허가증']);
  // 주입 함수가 그 목록을 실제로 본다.
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(
    source.includes('new Set(payload.optionalSections || [])'),
    '주입 함수가 optionalSections 를 읽어야 한다',
  );
  assert.ok(source.includes('if (!optional.has(title))'), '없는 칸은 조용히 넘어가야 한다');
});

/**
 * 안내 팝업 닫기(사장님 요청 2026-09-11).
 *
 * 실물: "[G kiditem / A kiditem] 이벤트에 참여중입니다 … [확인]". 덮여 있는 동안에는
 * 우리 클릭이 전부 그 창으로 먹어서 폼이 안 채워진다.
 *
 * ⭐ 위험한 쪽은 **너무 많이 닫는 것**이다. 되묻는 창을 대신 눌러 주면 사람의 결정을
 * 가로챈다. 그래서 규칙을 좁게 잡았고, 여기서 그 좁음을 지킨다.
 */
test('안내 팝업 규칙을 SPEC 이 들고 있다', () => {
  const { SPECS } = loadModule();
  const rule = SPECS.gmarket.dismissDialogs;
  // ⚠️ vm 안에서 만들어진 배열이라 realm 이 달라 deepEqual 이 실패한다. 값으로 본다.
  assert.equal(rule.closeLabels.length, 2);
  assert.ok(rule.closeLabels.includes('확인'));
  assert.ok(rule.closeLabels.includes('닫기'));
  // 고르라는 낱말이 섞여 있으면 손대지 않기 위한 목록.
  for (const word of ['취소', '등록', '삭제', '저장']) {
    assert.ok(rule.actionWords.includes(word), `${word} 를 알아야 한다`);
  }
  assert.match('정말 진행할까요?', new RegExp(rule.questionPattern));
  assert.match('상품을 등록하시겠습니까?', new RegExp(rule.questionPattern));
  assert.ok(rule.minMessageLength >= 10, '읽을 글이 있어야 안내창이다');
});

test('⭐ 되묻는 창은 누르지 않는다 — 사람의 결정을 가로채지 않는다', () => {
  const source = readFileSync(modulePath, 'utf8');
  // 닫기류가 아닌 행동 낱말이 하나라도 있으면 창 전체를 건너뛴다.
  assert.ok(
    source.includes('if (words.some((word) => !closeLabels.includes(word))) continue;'),
    '고르라는 낱말이 있는 창은 손대지 않아야 한다',
  );
  assert.ok(source.includes('question.test('), '묻는 말인 창은 손대지 않아야 한다');
  // 버튼만 있는 상자는 화면의 부품이지 안내창이 아니다.
  assert.ok(source.includes('rule.minMessageLength'), '읽을 글이 없으면 넘겨야 한다');
  // 같은 자리를 두 번 누르면 그 다음 화면의 버튼을 누르게 된다.
  assert.ok(source.includes('pressed.add(hit);'), '누른 자리는 기억해야 한다');
});

test('⭐ 본문 낱말로 거르지 않는다 — 이 안내창 본문에도 `등록` 이 들어 있다', () => {
  // "신규로 등록되는 상품은 … 제외됩니다". 본문에 '등록' 이 있다고 걸렀다면 못 닫는다.
  // 판단은 버튼 글자로만 한다.
  const { SPECS } = loadModule();
  assert.equal(SPECS.gmarket.dismissDialogs.forbidden, undefined);
});

test('팝업 닫기를 폼 채우기 **앞**에서 한다 — 덮인 채로 누르면 그 창이 먹는다', async () => {
  const source = readFileSync(modulePath, 'utf8');
  const dismiss = source.indexOf('const dismissed = await dismissNoticeDialogs(payload.dismissDialogs);');
  const category = source.indexOf('const wantCategory = payload.sectionCategory;');
  assert.ok(dismiss > 0 && category > 0);
  assert.ok(dismiss < category, '팝업 닫기가 분류보다 먼저여야 한다');

  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.ok(payload.dismissDialogs, '규칙이 페이지 안으로 전달돼야 한다');
});

/**
 * ⚠️ 회귀(라이브 2026-09-11): 처음엔 `div,section,article,dialog` 를 전부 훑어
 * `getComputedStyle` 을 불렀더니 **이 화면에서 렌더러가 45초 넘게 멈췄다.**
 * 요소가 수천 개인 화면이라 그렇다. 닫기 버튼은 몇 개뿐이니 거꾸로 올라가야 한다.
 */
test('⭐ 팝업을 글자에서 거꾸로 찾는다 — 전체 훑기+스타일조회는 화면을 멈춘다', () => {
  const source = readFileSync(modulePath, 'utf8');
  const fn = source.slice(
    source.indexOf('async function dismissNoticeDialogs'),
    source.indexOf('async function pickSectionOption'),
  );
  assert.ok(fn.length > 0, '함수를 찾아야 한다');
  // 창을 먼저 찾아 스타일을 훑으면 요소 2,200개짜리 이 화면에서 45초 넘게 멈춘다.
  assert.ok(!/querySelectorAll\("div,section,article,dialog"\)/.test(fn), '창부터 훑으면 안 된다');
  // 태그를 믿지 않는다 — 이 안내창의 `확인` 은 `<button>` 이 아니었다.
  assert.ok(fn.includes('actionLeaves'), '글자가 행동 낱말인 잎에서 출발해야 한다');
  assert.ok(fn.includes('el.children.length === 0'), '잎 요소로 찾아야 한다');
});

/**
 * ⚠️⚠️ 회귀(사장님 화면 2026-09-11, `G마켓 · 옥션 → 실패`):
 * "상품등록 폼(main.box__wrap)이 없습니다. 로그인 상태와 화면을 확인하세요."
 *
 * 로그인은 멀쩡했다. ESM Plus 는 Next.js SPA 라 `load` 가 끝난 **뒤에도 8~10초** 더
 * 지나야 칸이 그려지는데, 서비스워커는 로딩 완료 + 1.2초만 기다리고 주입한다.
 * 밖에서 더 오래 자는 것으로는 못 맞춘다 — 탭을 여러 개 열수록 느려진다.
 * **화면이 준비될 때까지 페이지 안에서 지켜봐야 한다.**
 */
test('⭐⭐ 느린 SPA 는 페이지 안에서 기다린다 — 고정 시간으로는 못 맞춘다', async () => {
  const { SPECS } = loadModule();
  assert.ok(SPECS.gmarket.formWaitMs >= 20000, '넉넉히 기다려야 한다');
  // 껍데기만 보고 진행하면 칸이 하나도 없어 전부 실패한다.
  assert.equal(SPECS.gmarket.readySelector, 'div.box__filter-item');

  const { api, calls } = harness();
  await api.register({ mall: 'gmarket', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.formWaitMs, SPECS.gmarket.formWaitMs);
  assert.equal(payload.readySelector, 'div.box__filter-item');

  const source = readFileSync(modulePath, 'utf8');
  // 껍데기가 생겨도 칸이 없으면 '아직' 으로 봐야 한다.
  assert.ok(
    source.includes('if (payload.readySelector && !document.querySelector(payload.readySelector)) return null;'),
    '칸이 생길 때까지 기다려야 한다',
  );
  assert.ok(source.includes('const hit = ready();'), '기다리는 동안에도 같은 조건을 봐야 한다');
});

test('로그인이 풀린 것과 화면이 느린 것을 구분해 말한다', () => {
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(source.includes('function noFormOutcome()'));
  assert.ok(
    source.includes('"몰에 로그인되어 있지 않습니다. 열린 탭에서 직접 로그인한 뒤 다시 누르세요."'),
    '로그인 화면으로 튕겼으면 그렇게 말해야 한다',
  );
});
