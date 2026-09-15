import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fillPath = path.join(
  repoRoot,
  'extensions/kiditem-os/content/coupang/wing-registration-fill.js',
);

/**
 * WING 옵션 목록 표.
 *
 * 쿠팡이 행을 담는 상자를 `.option-pane-table-content` → `.option-pane-table-body`
 * 로 바꾸면서(가상 스크롤 도입) 상자 이름에 매달린 선택자가 행을 0개로 봤다.
 * 그러면 `optionGenerate:noButton` 으로 멈춰 **가격·재고·대표이미지·추가이미지·
 * 상세설명이 전부 안 들어간다** — 증상 넷이 한 원인이었다.
 *
 * 아래 구조는 라이브에서 확장이 직접 보고한 것이다(2026-09-10):
 *   tableRow 4 · tableHead 1 · tableContent 0 · rowChecks 0
 *   클래스: option-pane-table-body / option-pane-virtual-list-content /
 *           scrollable-option-pane-table
 */
function extract(name) {
  const source = readFileSync(fillPath, 'utf8');
  const start = source.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} 를 찾지 못했습니다`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} 본문이 닫히지 않았습니다`);
}

/** 실측 구조를 그대로 흉내낸 최소 DOM. */
function makeOptionPane({ container = 'option-pane-table-body', dataRows = 1 } = {}) {
  const head = { className: 'option-pane-table-head', rows: [] };
  const rows = [];
  const headRow = { className: 'option-pane-table-row', parent: head, checkbox: { type: 'checkbox', checked: false } };
  head.rows.push(headRow);
  for (let i = 0; i < dataRows; i += 1) {
    rows.push({
      className: 'option-pane-table-row',
      parent: { className: container },
      checkbox: { type: 'checkbox', checked: false },
    });
  }
  const all = [headRow, ...rows];
  for (const row of all) {
    row.closest = (selector) =>
      (selector === '.option-pane-table-head' && row.parent === head ? head : null);
    row.querySelector = (selector) =>
      (selector === 'input[type="checkbox"]' ? row.checkbox : null);
  }
  const root = {
    className: 'option-content',
    querySelectorAll: (selector) => (selector === '.option-pane-table-row' ? all : []),
    querySelector: (selector) =>
      (selector === '.option-pane-table-head input[type="checkbox"]' ? headRow.checkbox : null),
  };
  return { root, rows };
}

function run(name, root, extra = {}) {
  const context = {
    document: { querySelector: (selector) => (selector === '.option-content' ? root : null) },
    OPTION_ROOT_SELECTOR: '.option-content',
    OPTION_DATA_ROW_SELECTOR: '.option-pane-table-row',
    Array, Boolean, ...extra,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${extract('optionDataRows')}\n${extract('optionRowChecks')}`, context);
  return vm.runInContext(`${name}()`, context);
}

test('행을 담는 상자 이름이 바뀌어도 옵션 행을 찾는다', () => {
  // 쿠팡이 2026-09 에 바꾼 이름.
  const now = makeOptionPane({ container: 'option-pane-table-body' });
  assert.equal(run('optionRowChecks', now.root).length, 1);

  // 그 전 이름. 예전 화면도 그대로 동작해야 한다.
  const before = makeOptionPane({ container: 'option-pane-table-content' });
  assert.equal(run('optionRowChecks', before.root).length, 1);

  // 앞으로 또 바뀌어도 버틴다.
  const future = makeOptionPane({ container: 'option-pane-table-whatever' });
  assert.equal(run('optionRowChecks', future.root).length, 1);
});

test('헤더 행은 옵션 행으로 세지 않는다', () => {
  // 헤더에도 `.option-pane-table-row` 와 전체선택 체크박스가 있다. 그걸 행으로 세면
  // 있지도 않은 옵션을 선택했다고 믿고 일괄입력이 조용히 무시된다.
  const pane = makeOptionPane({ dataRows: 3 });
  assert.equal(run('optionDataRows', pane.root).length, 3);
  assert.equal(run('optionRowChecks', pane.root).length, 3);
});

test('옵션 표가 없으면 빈 목록이다', () => {
  const context = { document: { querySelector: () => null }, OPTION_ROOT_SELECTOR: '.option-content', OPTION_DATA_ROW_SELECTOR: '.option-pane-table-row', Array, Boolean };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${extract('optionDataRows')}\n${extract('optionRowChecks')}`, context);
  assert.deepEqual(Array.from(vm.runInContext('optionRowChecks()', context)), []);
});

test('상자 이름으로 행을 찾지 않는다', () => {
  // 이 규칙이 깨지면 쿠팡이 이름을 바꿀 때마다 같은 사고가 반복된다.
  const source = readFileSync(fillPath, 'utf8');
  assert.ok(!/OPTION_ROW_CHECK_SELECTOR/.test(source));
  assert.ok(!/'\.option-pane-table-content [^']*checkbox/.test(source));
});
