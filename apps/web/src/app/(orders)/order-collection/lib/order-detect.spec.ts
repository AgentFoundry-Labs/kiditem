import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addSeenOrderKeys, diffNewOrderRows, loadSeenOrderKeys, rowKeysOf } from './order-detect';

describe('order-detect seen key storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores seen row keys under a versioned localStorage key', () => {
    addSeenOrderKeys('icecream-mall', ['order-1', 'order-2']);

    expect(window.localStorage.getItem('kiditem-order-seen:v2:icecream-mall')).toBe(
      JSON.stringify(['order-1', 'order-2']),
    );
    expect(window.localStorage.getItem('kiditem-order-seen:icecream-mall')).toBeNull();
  });

  it('migrates legacy unversioned keys when loading seen rows', () => {
    window.localStorage.setItem('kiditem-order-seen:icecream-mall', JSON.stringify(['legacy-1']));

    expect(loadSeenOrderKeys('icecream-mall')).toEqual(new Set(['legacy-1']));
    expect(window.localStorage.getItem('kiditem-order-seen:v2:icecream-mall')).toBe(
      JSON.stringify(['legacy-1']),
    );
    expect(window.localStorage.getItem('kiditem-order-seen:icecream-mall')).toBeNull();
  });

  it('ignores localStorage write failures without breaking diff detection', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => addSeenOrderKeys('icecream-mall', ['order-1'])).not.toThrow();
    expect(diffNewOrderRows(['주문번호'], [['A-1']], new Set()).newOrderCount).toBe(1);

    spy.mockRestore();
  });
});

describe('order-detect row diff', () => {
  it('builds stable row keys and counts distinct new order numbers', () => {
    const rows = [
      [' A-1 ', '상품1'],
      ['A-1', '상품2'],
      ['A-2', '상품3'],
    ];
    const keys = rowKeysOf(rows);

    const diff = diffNewOrderRows(['주문번호', '상품명'], rows, new Set([keys[1]]));

    expect(diff.newRows).toEqual([rows[0], rows[2]]);
    expect(diff.newRowKeys).toEqual([keys[0], keys[2]]);
    expect(diff.newOrderCount).toBe(2);
  });
});
