import { describe, expect, it } from 'vitest';
import { moveMallKey, reorderMallKeys } from './mall-order';

const KEYS = ['icecream-mall', 'kidsnote', 'onch', 'domeggook'];

describe('moveMallKey', () => {
  it('moves a mall one slot toward the front', () => {
    expect(moveMallKey(KEYS, 'onch', -1)).toEqual([
      'icecream-mall', 'onch', 'kidsnote', 'domeggook',
    ]);
  });

  it('moves a mall one slot toward the back', () => {
    expect(moveMallKey(KEYS, 'kidsnote', 1)).toEqual([
      'icecream-mall', 'onch', 'kidsnote', 'domeggook',
    ]);
  });

  it('keeps the order when the mall is already at the edge', () => {
    expect(moveMallKey(KEYS, 'icecream-mall', -1)).toEqual(KEYS);
    expect(moveMallKey(KEYS, 'domeggook', 1)).toEqual(KEYS);
  });

  it('ignores a mall that is not in the list', () => {
    expect(moveMallKey(KEYS, 'gmarket', 1)).toEqual(KEYS);
  });

  it('never mutates the input', () => {
    const original = [...KEYS];
    moveMallKey(KEYS, 'onch', -1);
    expect(KEYS).toEqual(original);
  });
});

describe('reorderMallKeys', () => {
  it('drops a mall onto a later slot', () => {
    expect(reorderMallKeys(KEYS, 'icecream-mall', 'onch')).toEqual([
      'kidsnote', 'onch', 'icecream-mall', 'domeggook',
    ]);
  });

  it('drops a mall onto an earlier slot', () => {
    expect(reorderMallKeys(KEYS, 'domeggook', 'kidsnote')).toEqual([
      'icecream-mall', 'domeggook', 'kidsnote', 'onch',
    ]);
  });

  it('keeps the order when dropped on itself or on an unknown mall', () => {
    expect(reorderMallKeys(KEYS, 'onch', 'onch')).toEqual(KEYS);
    expect(reorderMallKeys(KEYS, 'onch', 'gmarket')).toEqual(KEYS);
  });
});
