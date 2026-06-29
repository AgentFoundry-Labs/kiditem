import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys.settlements', () => {
  it('uses one settlement list key family for all settlement reads', () => {
    expect(queryKeys.settlements.all).toEqual(['settlements']);
    expect(queryKeys.settlements.list()).toEqual(['settlements', 'list', 'all']);
    expect(queryKeys.settlements.list('2026-05')).toEqual(['settlements', 'list', '2026-05']);
  });
});
