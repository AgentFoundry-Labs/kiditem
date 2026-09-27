import { describe, expect, it } from 'vitest';
import { observedOptionConfirms } from './availability-confirmation';

describe('observedOptionConfirms (KID-364)', () => {
  it('confirms a sold-out option by zero stock or a stopped status', () => {
    expect(observedOptionConfirms('sold_out', { stock: 0, status: null })).toBe(true);
    expect(observedOptionConfirms('sold_out', { stock: null, status: '품절' })).toBe(true);
    expect(observedOptionConfirms('sold_out', { stock: null, status: 'SUSPENSION' })).toBe(true);
    expect(observedOptionConfirms('sold_out', { stock: 3, status: '판매중' })).toBe(false);
    expect(observedOptionConfirms('sold_out', { stock: null, status: null })).toBe(false);
  });

  it('confirms a resumed option only when the mall shows it on sale', () => {
    expect(observedOptionConfirms('resume', { stock: 5, status: '판매중' })).toBe(true);
    expect(observedOptionConfirms('resume', { stock: 5, status: null })).toBe(true);
    expect(observedOptionConfirms('resume', { stock: 0, status: '판매중' })).toBe(false);
    expect(observedOptionConfirms('resume', { stock: null, status: '판매중지' })).toBe(false);
    expect(observedOptionConfirms('resume', { stock: null, status: null })).toBe(false);
  });
});
