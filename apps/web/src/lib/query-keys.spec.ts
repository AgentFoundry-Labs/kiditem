import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys';

describe('queryKeys.settlements', () => {
  it('uses one settlement list key family for all settlement reads', () => {
    expect(queryKeys.settlements.all).toEqual(['settlements']);
    expect(queryKeys.settlements.list()).toEqual(['settlements', 'list', 'all']);
    expect(queryKeys.settlements.list('2026-05')).toEqual(['settlements', 'list', '2026-05']);
  });
});

describe('channel SKU matching query keys', () => {
  it('keeps account reads and mapping lists in stable families', () => {
    expect(queryKeys.channelAccounts.active()).toEqual([
      'channelAccounts',
      'active',
    ]);
    expect(queryKeys.channelSkuMappings.lists()).toEqual([
      'channelSkuMappings',
      'list',
    ]);

    const first = {
      channelAccountId: 'account-1',
      mappingStatus: 'needs_review',
      page: '1',
    };
    const second = {
      channelAccountId: 'account-1',
      mappingStatus: 'needs_review',
      page: '1',
    };

    expect(queryKeys.channelSkuMappings.list(first)).toEqual(
      queryKeys.channelSkuMappings.list(second),
    );
  });

  it('scopes candidates to one channel SKU and canonical params', () => {
    const params = { search: 'ABC-1' };

    expect(
      queryKeys.channelSkuMappings.candidates('sku-1', params),
    ).toEqual([
      'channelSkuMappings',
      'candidates',
      'sku-1',
      { search: 'ABC-1' },
    ]);
  });
});
