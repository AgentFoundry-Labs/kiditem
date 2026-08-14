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

  it('registers the exact keyword suggestion browser operation', () => {
    const definition = SOURCING_OPERATIONS.find(
      (operation) => operation.key === 'sourcing.collect_keyword_suggestions',
    );
    expect(definition).toMatchObject({
      engineType: 'browser',
      ownerDomain: 'sourcing',
      resourceClass: 'extension_coupang',
      maxAttempts: 3,
      executionTimeoutMs: 15 * 60_000,
      allowedTriggers: ['dashboard', 'domain_screen'],
      scheduleSupported: false,
    });
    expect(definition?.inputSchema.parse({
      keyword: '  Ａ   Pencil ',
      maxResults: 30,
    })).toEqual({ keyword: 'A Pencil', maxResults: 30 });
  });
});
