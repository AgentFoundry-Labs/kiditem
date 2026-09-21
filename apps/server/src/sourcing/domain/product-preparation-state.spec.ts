import { describe, expect, it } from 'vitest';
import { blocksCandidateTerminalTransition } from './product-preparation-state';

describe('ProductPreparation draft lifecycle', () => {
  it.each([
    ['draft', true], ['submitting', true], ['failed', false],
    ['registered', false], ['cancelled', false],
  ] as const)('draft lifecycle blocks candidate termination in %s = %s', (status, expected) => {
    expect(blocksCandidateTerminalTransition({ status })).toBe(expected);
  });
});
