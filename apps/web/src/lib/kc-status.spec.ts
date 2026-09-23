import { describe, expect, it } from 'vitest';
import { KC_STATUS_SELECT_OPTIONS, kcStatusFromSelectValue, kcStatusSelectValue } from './kc-status';

describe('KC status select mapping', () => {
  it('shows the unknown status as the empty choice and keeps none/exists', () => {
    expect(kcStatusSelectValue('unknown')).toBe('');
    expect(kcStatusSelectValue('none')).toBe('none');
    expect(kcStatusSelectValue('exists')).toBe('exists');
  });

  it('stores anything but none/exists as unknown', () => {
    expect(kcStatusFromSelectValue('')).toBe('unknown');
    expect(kcStatusFromSelectValue('unknown')).toBe('unknown');
    expect(kcStatusFromSelectValue('none')).toBe('none');
    expect(kcStatusFromSelectValue('exists')).toBe('exists');
  });

  it('offers one choice per stored status', () => {
    expect(KC_STATUS_SELECT_OPTIONS.map((option) => option.value)).toEqual(['', 'none', 'exists']);
  });
});
