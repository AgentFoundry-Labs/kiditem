// wing-product-delete.test.mjs
//
// 쿠팡 WING 상품 삭제 자동화의 되돌릴 수 없는 동작을 고정한다.
//
// DOM 은 라이브 실측(2026-07, /tenants/seller-web/vendor-inventory/list)을 그대로 흉내낸다:
//   - 행: `tr.inventory-line`, 8자리 이상 숫자는 등록상품ID 하나뿐
//   - 일괄적용 드롭다운: `div.w-ui-vue-dropdown-menu` (overflow auto, clientHeight 208,
//     scrollHeight 396), 항목은 `div.w-ui-vue-dropdown-menu-item` ×12, 높이 33px.
//     '삭제'는 7번째(offsetTop 198)라 스크롤하지 않으면 잘려 있다.
//   - 확인 모달: SweetAlert 1.x 싱글턴 `div.sweet-alert` (숨김 2개 + 열린 1개),
//     `button.cancel`('취소')이 `button.confirm`('확인')보다 **앞**에 있다.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../coupang-ads-scraper/content/wing-product-delete.js', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// 아주 작은 DOM 흉내. 이 스크립트가 실제로 쓰는 셀렉터만 지원한다.
// ---------------------------------------------------------------------------

function parseCompound(part) {
  const spec = { tag: null, classes: [], id: null, attrs: [] };
  const re = /(^[a-zA-Z][\w-]*)|\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=("?)([^\]"]*)\5)?\]/g;
  let m;
  while ((m = re.exec(part)) !== null) {
    if (m[1]) spec.tag = m[1].toUpperCase();
    else if (m[2]) spec.classes.push(m[2]);
    else if (m[3]) spec.id = m[3];
    else if (m[4]) spec.attrs.push([m[4], m[6] === undefined ? null : m[6]]);
  }
  return spec;
}

function parseSelector(selector) {
  return selector.split(',').map((p) => parseCompound(p.trim()));
}

class El {
  constructor(tag, options = {}) {
    this.tagName = String(tag).toUpperCase();
    this.className = options.className || '';
    this.id = options.id || '';
    this.attrs = { ...(options.attrs || {}) };
    this.ownText = options.text || '';
    this.childNodes = [];
    this.parentElement = null;
    this.hidden = options.hidden === true;
    this.checked = options.checked === true;
    this.onClick = options.onClick || null;
    this.clickLog = options.clickLog || null;
    this.offsetTop = options.offsetTop || 0;
    this.offsetHeight = options.offsetHeight || 0;
    this.clientHeight = options.clientHeight || 0;
    this.scrollHeight = options.scrollHeight || 0;
    this.scrollTop = 0;
    this.noScrollIntoView = options.noScrollIntoView === true;
    if (options.type) this.attrs.type = options.type;
    if (this.noScrollIntoView) this.scrollIntoView = undefined;
  }

  append(...kids) {
    for (const kid of kids) {
      kid.parentElement = this;
      this.childNodes.push(kid);
    }
    return this;
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.childNodes;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  get textContent() {
    return this.ownText + this.childNodes.map((c) => c.textContent).join(' ');
  }

  get offsetParent() {
    let node = this;
    while (node) {
      if (node.hidden) return null;
      node = node.parentElement;
    }
    return this.parentElement || null;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name);
  }

  descendants() {
    const out = [];
    for (const kid of this.childNodes) {
      out.push(kid, ...kid.descendants());
    }
    return out;
  }

  matchesSpec(spec) {
    if (spec.tag && spec.tag !== this.tagName) return false;
    const classes = String(this.className).split(/\s+/).filter(Boolean);
    if (!spec.classes.every((c) => classes.includes(c))) return false;
    if (spec.id && spec.id !== this.id) return false;
    return spec.attrs.every(([name, value]) => (
      value === null ? this.hasAttribute(name) : this.getAttribute(name) === value
    ));
  }

  querySelectorAll(selector) {
    const specs = parseSelector(selector);
    return this.descendants().filter((node) => specs.some((s) => node.matchesSpec(s)));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  scrollIntoView() {
    let container = this.parentElement;
    while (container && !(container.clientHeight && container.scrollHeight > container.clientHeight)) {
      container = container.parentElement;
    }
    if (!container) return;
    const top = this.offsetTop;
    const bottom = top + this.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight;
    }
  }

  click() {
    const label = this.textContent.replace(/\s+/g, ' ').trim();
    if (this.clickLog) this.clickLog.push(label || `<${this.tagName.toLowerCase()}>`);
    if (this.getAttribute('type') === 'checkbox') this.checked = !this.checked;
    if (this.onClick) this.onClick(this);
  }
}

const BULK_MENU_LABELS = [
  '판매가 변경',
  '판매상태 변경',
  '배송정보 변경',
  '출고소요일 변경',
  '판매 요청',
  '바코드 라벨 인쇄',
  '삭제',
  '브랜드 설정/변경',
  '자동생성옵션',
  '인당구매수량제한',
  '판매기간',
  '출고일 자동 조정 관리 예외등록',
];

const DELETE_CONFIRM_TITLE = '선택하신 상품은 요청 즉시 삭제되며, 복구가 불가능합니다. 삭제하시겠습니까?';
const DELETE_CONFIRM_TEXT = '삭제시 주의사항 1. 로켓그로스 상품은 삭제할 수 없습니다. '
  + '2. 삭제된 상품은 조회만 가능합니다. 3. 상품상태가 승인대기중인 경우, 상품 삭제가 불가능합니다. '
  + '4. 일괄삭제의 경우, 다소 시간이 걸릴수 있습니다. (최대 3분)';

const PENDING_APPROVAL_ALERT = '승인대기중/심사중인 상품은 삭제할 수 없습니다. 선택한 상품을 다시 확인해주세요.';

/**
 * 라이브를 흉내낸 상품목록 페이지.
 *
 * @param {object} options
 *  - productIds: 목록에 그릴 등록상품ID들
 *  - alertOnDelete: '삭제' 클릭 시 뜨는 SweetAlert 내용 ({ title, text, withCancel })
 *  - deleteRemovesRow: 확인을 누르면 실제로 행이 사라지는가
 *  - noScrollIntoView: 항목에 scrollIntoView 가 없어 scrollTop 폴백을 타야 하는가
 */
function buildPage(options = {}) {
  const {
    productIds = ['16311534438'],
    alertOnDelete = { title: DELETE_CONFIRM_TITLE, text: DELETE_CONFIRM_TEXT, withCancel: true },
    deleteRemovesRow = true,
    noScrollIntoView = false,
  } = options;

  const clickLog = [];
  const body = new El('body');
  const state = { menu: null, openedAlert: null, rows: new Map() };

  const table = new El('table');
  body.append(table);
  for (const id of productIds) {
    const row = new El('tr', { className: 'inventory-line' });
    row.append(
      new El('td').append(new El('input', { type: 'checkbox', clickLog })),
      new El('td', { text: `4000과일바구니딸깍이키링 판매자배송 | 등록상품ID ${id} 90,000원 상품삭제` }),
    );
    table.append(row);
    if (!state.rows.has(id)) state.rows.set(id, []);
    state.rows.get(id).push(row);
  }

  // SweetAlert 싱글턴은 목록 페이지에 **2개** 떠 있다(라이브 실측). 둘 다 숨김 + 자리표시.
  const makeSweetAlert = (hidden) => {
    const modal = new El('div', { className: 'sweet-alert', hidden });
    const title = new El('h2', { className: 'alert-title', text: 'Title' });
    const text = new El('p', { className: 'alert-text', text: 'Text' });
    const buttons = new El('div', { className: 'alert-buttons' });
    const cancel = new El('button', { className: 'cancel', text: 'Cancel', clickLog });
    const confirm = new El('button', { className: 'confirm', text: 'OK', clickLog });
    buttons.append(cancel, confirm);
    modal.append(title, text, buttons);
    modal.parts = { title, text, cancel, confirm };
    return modal;
  };
  const idleAlerts = [makeSweetAlert(true), makeSweetAlert(true)];
  body.append(...idleAlerts);

  function openAlert({ title, text, withCancel }) {
    const modal = idleAlerts[0];
    modal.hidden = false;
    modal.parts.title.ownText = title;
    modal.parts.text.ownText = text || ' ';
    modal.parts.cancel.ownText = '취소';
    modal.parts.cancel.hidden = !withCancel;
    modal.parts.confirm.ownText = '확인';
    modal.parts.confirm.onClick = () => {
      modal.hidden = true;
      if (!deleteRemovesRow) return;
      for (const id of productIds) {
        for (const row of state.rows.get(id) || []) row.remove();
      }
    };
    modal.parts.cancel.onClick = () => {
      modal.hidden = true;
      state.cancelPressed = true;
    };
    state.openedAlert = modal;
  }

  function openMenu() {
    if (state.menu) return;
    const floating = new El('div', { className: 'w-ui-vue-floating' });
    const menu = new El('div', {
      className: 'w-ui-vue-dropdown-menu brand-options-disabled',
      clientHeight: 208,
      scrollHeight: BULK_MENU_LABELS.length * 33,
    });
    BULK_MENU_LABELS.forEach((label, index) => {
      const item = new El('div', {
        className: 'w-ui-vue-dropdown-menu-item',
        offsetTop: index * 33,
        offsetHeight: 33,
        clickLog,
        noScrollIntoView,
      });
      item.append(new El('span', { text: label }));
      item.onClick = () => {
        if (label !== '삭제') return;
        openAlert(alertOnDelete);
      };
      menu.append(item);
    });
    floating.append(menu);
    body.append(floating);
    state.menu = menu;
  }

  const trigger = new El('button', {
    className: 'wing-web-component w-btn-secondary',
    text: '선택한 상품 일괄적용',
    clickLog,
    onClick: openMenu,
  });
  body.append(trigger);

  // 문서 전역 탐색을 하면 걸려드는 별점 위젯.
  const rating = new El('div', { id: 'report-rating-trigger' });
  rating.append(new El('button', { text: '삭제', clickLog }));
  rating.append(new El('button', { text: '확인', clickLog }));
  body.append(rating);

  const document = {
    body,
    querySelectorAll: (s) => body.querySelectorAll(s),
    querySelector: (s) => body.querySelector(s),
  };

  return { document, body, clickLog, state };
}

function createHarness(pageOptions) {
  const page = buildPage(pageOptions);
  let listener = null;
  let now = 0;

  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: {
          addListener(next) {
            listener = next;
          },
        },
      },
    },
    console,
    document: page.document,
    KidItemWingAccountIdentity: pageOptions?.identity === undefined
      ? { verifyExpectedVendorId: (expectedVendorId) => expectedVendorId === 'A00012345'
        ? { ok: true, vendorId: expectedVendorId, source: 'dom:data-vendor-id' }
        : { ok: false, error: 'identity mismatch' } }
      : pageOptions.identity,
    // 가짜 시계: setTimeout 이 즉시 실행되며 시계를 앞으로 민다. 3분 대기도 즉시 끝난다.
    setTimeout: (fn, ms) => {
      now += Number(ms) || 0;
      Promise.resolve().then(fn);
      return 0;
    },
    clearTimeout: () => {},
    Date: { now: () => now },
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'wing-product-delete.js' });
  assert.ok(listener, 'deleteWingProduct 리스너가 등록되어야 한다');

  return {
    ...page,
    async run(message) {
      return new Promise((resolve) => {
        const isAsync = listener({
          action: 'deleteWingProduct',
          expectedVendorId: 'A00012345',
          ...message,
        }, {}, resolve);
        assert.equal(isAsync, true);
      });
    },
  };
}

// ---------------------------------------------------------------------------

test("드롭다운을 스크롤해 '삭제' 항목을 찾아 클릭한다", async () => {
  const harness = createHarness();
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, true, result.error);
  // 라이브 실측과 같은 값: offsetTop 198 + 높이 33 - clientHeight 208 = 23
  assert.equal(harness.state.menu.scrollTop, 23);
  assert.ok(result.steps.includes('delete:bulkMenuOpened'));
  assert.ok(result.steps.includes('delete:deleteItemRevealed'));
  assert.ok(result.steps.includes('delete:menuDeleteClicked'));
  assert.ok(harness.clickLog.includes('삭제'), '삭제 항목을 눌러야 한다');
  assert.equal(result.evidence.vendorId, 'A00012345');
  assert.equal(result.evidence.source, 'dom:data-vendor-id');
});

test('WING identity mismatch or missing helper aborts before the first delete-page click', async () => {
  const unavailable = createHarness({ identity: {} });
  const mismatch = createHarness({
    identity: { verifyExpectedVendorId: () => ({ ok: false, error: 'identity mismatch' }) },
  });

  for (const harness of [unavailable, mismatch]) {
    const result = await harness.run({ externalId: '16311534438' });
    assert.equal(result.ok, false);
    assert.deepEqual(harness.clickLog, []);
    assert.equal(harness.state.menu, null);
  }
});

test("scrollIntoView 가 없어도 컨테이너 scrollTop 으로 '삭제'를 노출시킨다", async () => {
  const harness = createHarness({ noScrollIntoView: true });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, true, result.error);
  assert.ok(harness.state.menu.scrollTop > 0, '컨테이너를 직접 스크롤해야 한다');
  assert.ok(result.steps.includes('delete:deleteItemRevealed'));
});

test("'판매 요청' / '판매상태 변경'을 '삭제'로 오인하지 않는다", async () => {
  const harness = createHarness();
  await harness.run({ externalId: '16311534438' });

  for (const label of BULK_MENU_LABELS.filter((l) => l !== '삭제')) {
    assert.ok(
      !harness.clickLog.includes(label),
      `'${label}' 은 절대 눌리면 안 된다 (클릭 로그: ${harness.clickLog.join(' / ')})`,
    );
  }
  assert.ok(!harness.clickLog.includes('판매 요청'));
  assert.ok(!harness.clickLog.includes('판매상태 변경'));
});

test("확인 모달의 '확인'을 누르고 '취소'는 절대 누르지 않는다", async () => {
  const harness = createHarness();
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, true, result.error);
  assert.ok(result.steps.includes('delete:confirmModalMatched'));
  assert.ok(result.steps.includes('delete:confirm:확인'));
  assert.ok(harness.clickLog.includes('확인'), "'확인'을 눌러야 한다");
  assert.ok(!harness.clickLog.includes('취소'), "'취소'는 절대 누르면 안 된다");
  assert.notEqual(harness.state.cancelPressed, true);
});

test('별점 위젯의 삭제/확인 버튼은 누르지 않는다', async () => {
  const harness = createHarness();
  await harness.run({ externalId: '16311534438' });

  const ratingButtons = harness.body
    .querySelector('#report-rating-trigger')
    .querySelectorAll('button');
  for (const button of ratingButtons) {
    assert.equal(button.clickLog.filter((l) => l === button.ownText).length >= 0, true);
  }
  // 별점 위젯 버튼이 눌렸다면 삭제/확인이 두 번씩 기록된다.
  assert.equal(harness.clickLog.filter((l) => l === '삭제').length, 1);
  assert.equal(harness.clickLog.filter((l) => l === '확인').length, 1);
});

test('등록상품ID 가 목록에 없으면 아무것도 클릭하지 않는다', async () => {
  const harness = createHarness({ productIds: ['16311492950'] });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, false);
  assert.match(result.error, /찾지 못했습니다/);
  assert.deepEqual(harness.clickLog, []);
  assert.equal(harness.state.menu, null, '드롭다운조차 열지 않아야 한다');
});

test('등록상품ID 가 2건이면 아무것도 클릭하지 않는다', async () => {
  const harness = createHarness({ productIds: ['16311534438', '16311534438'] });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, false);
  assert.match(result.error, /행이 2개/);
  assert.ok(result.steps.some((s) => s.startsWith('delete:ambiguousRows')));
  assert.deepEqual(harness.clickLog, []);
  assert.equal(harness.state.menu, null);
});

test('등록상품ID 형식이 틀리면 즉시 거부한다', async () => {
  const harness = createHarness();
  const result = await harness.run({ externalId: 'abc' });

  assert.equal(result.ok, false);
  assert.match(result.error, /올바르지 않습니다/);
  assert.deepEqual(harness.clickLog, []);
});

test('승인대기중으로 삭제가 막히면 성공으로 보고하지 않고 사유를 올린다', async () => {
  const harness = createHarness({
    alertOnDelete: { title: PENDING_APPROVAL_ALERT, text: ' ', withCancel: false },
    deleteRemovesRow: false,
  });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.match(result.blockedReason, /승인대기중/);
  assert.match(result.error, /쿠팡이 삭제를 거부했습니다/);
  assert.match(result.coupangMessage, /삭제할 수 없습니다/);
  assert.ok(result.steps.includes('delete:blockedAlert'));
  // 차단 안내에서는 확인도 취소도 누르지 않는다.
  assert.ok(!harness.clickLog.includes('확인'));
  assert.ok(!harness.clickLog.includes('취소'));
});

test('로켓그로스 차단 안내도 성공으로 보고하지 않는다', async () => {
  const harness = createHarness({
    alertOnDelete: { title: '로켓그로스 상품은 삭제할 수 없습니다.', text: ' ', withCancel: false },
    deleteRemovesRow: false,
  });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.match(result.blockedReason, /로켓그로스/);
  assert.ok(!harness.clickLog.includes('확인'));
});

test('확인을 눌러도 행이 남아 있으면 성공으로 보고하지 않는다', async () => {
  const harness = createHarness({ deleteRemovesRow: false });
  const result = await harness.run({ externalId: '16311534438' });

  assert.equal(result.ok, false);
  assert.ok(harness.clickLog.includes('확인'));
  assert.match(result.error, /아직 목록에 있습니다/);
  assert.match(result.error, /최대 3분/);
  assert.ok(result.steps.includes('delete:settleTimeout'));
});

test('일괄삭제 대기 시간은 모달 안내(최대 3분)보다 넉넉하다', () => {
  const timeout = /const DELETE_SETTLE_TIMEOUT_MS = (\d+);/.exec(source);
  assert.ok(timeout, 'DELETE_SETTLE_TIMEOUT_MS 가 있어야 한다');
  assert.ok(Number(timeout[1]) >= 180000, '최대 3분(180000ms) 이상이어야 한다');
});

test('드롭다운/모달 탐색은 컨테이너 안으로 제한된다', () => {
  assert.match(source, /const DROPDOWN_MENU_SELECTOR = '\.w-ui-vue-dropdown-menu';/);
  assert.match(source, /const DROPDOWN_ITEM_SELECTOR = '\.w-ui-vue-dropdown-menu-item';/);
  assert.match(source, /const CONFIRM_MODAL_SELECTOR = '\.sweet-alert';/);
  assert.match(source, /const CONFIRM_BUTTON_SELECTOR = 'button\.confirm';/);
  // 드롭다운 항목은 반드시 menu 하위에서만 찾는다.
  assert.match(source, /menu\.querySelectorAll\(DROPDOWN_ITEM_SELECTOR\)/);
  assert.match(source, /modal\.querySelector\(CONFIRM_BUTTON_SELECTOR\)/);
  // '취소'는 거부 목록에 있어야 한다.
  assert.match(source, /const NEVER_CLICK_TEXTS = \['취소'/);
});
