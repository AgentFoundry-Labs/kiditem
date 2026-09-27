import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import manifest from '../kiditem-os/manifest.json';
import source from '../kiditem-os/content/page-call/wing-form-compat.js?raw';

/**
 * 쿠팡 WING formV2 런타임 호환(`content/page-call/wing-form-compat.js`, KID-256 — 옛 node 스펙 `wing-form-runtime-compat` 이식).
 * formV2 번들이 lodash 전역 `_` 대신 다른 값을 `_`로 잡은 채 `_.isEmpty`·`_.filter`를 부른다. 파일은 자기 realm(jsdom 창)에서
 * 돈다 — 문자열 원형을 고치는 보완이 스펙 realm을 더럽히지 않게.
 */
const FORM_PATH = '/tenants/seller-web/vendor-inventory/formV2';

function load(options: { underscore?: unknown; atFormStart?: boolean }) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: `https://wing.coupang.com${options.atFormStart ? FORM_PATH : '/not-the-wing-form'}`,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  if (options.underscore !== undefined) window._ = options.underscore;
  window.eval(source);
  if (!options.atFormStart) window.history.replaceState(null, '', FORM_PATH);
  return { window, compat: () => window.__kiditemPageCalls['wing.compat']() as { ok: boolean; status: string } };
}

describe('쿠팡 WING formV2 런타임 호환', () => {
  it('없는 lodash 기능만 채운다', () => {
    const { window, compat } = load({ underscore: undefined });
    const underscore = window.eval('(function translate() {})');
    window._ = underscore;
    expect(compat()).toMatchObject({ ok: true, status: 'installed' });
    expect(window._).toBe(underscore);
    expect([window._.isEmpty(null), window._.isEmpty({}), window._.isEmpty({ id: 1 }), window._.isEmpty([]), window._.isEmpty(['option'])]).toEqual([true, true, false, true, false]);
    expect(Array.from(window._.filter([{ id: 1 }, { id: 2 }], (item: { id: number }) => item.id === 2))).toEqual([{ id: 2 }]);
    expect(Array.from(window._.filter({ first: 1, second: 2 }, (value: number) => value > 1))).toEqual([2]);
  });

  it('윙에 이미 있는 lodash 호환 구현은 그대로 둔다', () => {
    const existing = { isEmpty: () => 'native-empty-result', filter: () => 'native-filter-result' };
    const { window, compat } = load({ underscore: existing });
    expect(compat()).toMatchObject({ ok: true, status: 'already-compatible' });
    expect(window._.isEmpty).toBe(existing.isEmpty);
    expect(window._.filter).toBe(existing.filter);
  });

  it('윙이 `_`를 문자열로 잡는 경우도 확인 때 고친다', () => {
    const { window, compat } = load({ underscore: { isEmpty: (value: unknown) => value == null, filter: (values: unknown[], predicate: (value: unknown) => boolean) => values.filter(predicate) } });
    expect(compat().ok).toBe(true);
    expect(window.eval(`((_) => ({ isEmpty: typeof _.isEmpty, filter: typeof _.filter }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`)).toEqual({ isEmpty: 'function', filter: 'function' });
  });

  it('문서 시작에서 윙의 첫 `_` 대입을 가로채고, 다시 대입해도 기능을 지킨다', () => {
    const { window } = load({ atFormStart: true });
    const assigned = window.eval('(function translate() {})');
    window._ = assigned;
    expect(window._).toBe(assigned);
    expect(window._.isEmpty({})).toBe(true);
    const reassigned = window.eval('(function reassignedTranslate() {})');
    window._ = reassigned;
    expect(window._).toBe(reassigned);
    expect(window._.isEmpty({ option: 'color' })).toBe(false);
    expect(Array.from(window._.filter(['color', 'quantity'], (value: string) => value !== 'quantity'))).toEqual(['color']);
  });

  it('문서 시작에서 문자열 `_`에도 기능을 붙이되 열거되지 않게 둔다', () => {
    const { window } = load({ underscore: { isEmpty: (value: unknown) => value == null, filter: (values: unknown[], predicate: (value: unknown) => boolean) => values.filter(predicate) }, atFormStart: true });
    const behavior = window.eval(`((_) => ({
      empty: _.isEmpty({}),
      nonEmpty: _.isEmpty({ id: 1 }),
      filtered: Array.from(_.filter(['color', 'quantity'], (value) => value === 'color')),
      enumerable: [Object.getOwnPropertyDescriptor(String.prototype, 'isEmpty').enumerable, Object.getOwnPropertyDescriptor(String.prototype, 'filter').enumerable],
    }))('b33cdffa-8647-4f29-8f0c-2a872166a726')`);
    expect({ ...behavior, filtered: Array.from(behavior.filtered) }).toEqual({ empty: true, nonEmpty: false, filtered: ['color'], enumerable: [false, false] });
  });

  it('매니페스트는 formV2에만, 문서 시작에, MAIN world로, 맨 위 프레임에만 이 파일을 넣는다(사람이 연 formV2 탭도 보완받는다)', () => {
    const entry = (manifest.content_scripts as Array<{ js?: string[]; matches: string[]; run_at?: string; world?: string; all_frames?: boolean }>)
      .find((script) => script.js?.includes('content/page-call/wing-form-compat.js'));
    expect(entry).toMatchObject({
      matches: ['https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2*'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: false,
    });
  });
});
