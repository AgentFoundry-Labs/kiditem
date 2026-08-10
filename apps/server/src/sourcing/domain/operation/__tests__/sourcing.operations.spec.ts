import { describe, expect, it } from 'vitest';
import { SOURCING_OPERATIONS } from '../sourcing.operations';

describe('Sourcing Operations', () => {
  it('allows the existing collection operation to be started by Agent OS', () => {
    expect(
      SOURCING_OPERATIONS.find(
        (operation) => operation.key === 'sourcing.collect_daily_trends',
      )?.allowedTriggers,
    ).toContain('agent');
  });
});
