import { describe, expect, it } from 'vitest';
import { summarizeWholesaleCollection } from './wholesale-collection-outcome';

describe('summarizeWholesaleCollection', () => {
  it.each([
    {
      name: 'all failed',
      units: ['failed', 'failed'],
      status: 'failed',
      counts: { succeeded: 0, failed: 2, changed: 0 },
    },
    {
      name: 'mixed',
      units: ['changed', 'failed'],
      status: 'partial',
      counts: { succeeded: 1, failed: 1, changed: 1 },
    },
    {
      name: 'zero changed',
      units: ['unchanged', 'unchanged'],
      status: 'no_change',
      counts: { succeeded: 2, failed: 0, changed: 0 },
    },
    {
      name: 'complete',
      units: ['changed', 'changed'],
      status: 'complete',
      counts: { succeeded: 2, failed: 0, changed: 2 },
    },
  ] as const)('classifies $name truthfully', ({ units, status, counts }) => {
    expect(summarizeWholesaleCollection(true, units)).toMatchObject({ status, ...counts });
  });

  it('does not present untouched route-entry rows as collecting or complete', () => {
    expect(summarizeWholesaleCollection(false, ['pending', 'pending']))
      .toEqual({
        status: 'idle',
        total: 2,
        finished: 0,
        succeeded: 0,
        failed: 0,
        changed: 0,
      });
  });

  it('is mutation-sensitive to one successful unit in an otherwise failed batch', () => {
    const allFailed = summarizeWholesaleCollection(true, ['failed', 'failed']);
    const oneChanged = summarizeWholesaleCollection(true, ['changed', 'failed']);

    expect(allFailed.status).toBe('failed');
    expect(oneChanged.status).toBe('partial');
  });
});
