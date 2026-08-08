import { describe, expect, it } from 'vitest';
import {
  isActiveCollectionStatus,
  isTerminalCollectionStatus,
  terminalStatusForCollectionError,
} from './sourcing-collection-run';

describe('sourcing collection run policy', () => {
  it('keeps active and terminal states disjoint', () => {
    expect(isActiveCollectionStatus('collecting')).toBe(true);
    expect(isActiveCollectionStatus('complete')).toBe(false);
    expect(isTerminalCollectionStatus('complete')).toBe(true);
    expect(isTerminalCollectionStatus('collecting')).toBe(false);
  });

  it('preserves cancellation and fencing as terminal states', () => {
    expect(terminalStatusForCollectionError({ code: 'COLLECTION_CANCELLED' })).toBe(
      'cancelled',
    );
    expect(terminalStatusForCollectionError({ code: 'COLLECTION_SUPERSEDED' })).toBe(
      'superseded',
    );
    expect(terminalStatusForCollectionError({ code: 'COLLECTION_FAILED' })).toBe('failed');
  });
});
