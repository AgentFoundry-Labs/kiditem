import { describe, expect, it } from 'vitest';
import { queryKeys } from './query-keys';

describe('conversation query keys', () => {
  it('keeps each authenticated identity isolated across summaries, readiness, preferences, and invocations without a provider-history cache', () => {
    const firstIdentity = { userId: 'user-1', organizationId: 'org-1' };
    const secondIdentity = { userId: 'user-2', organizationId: 'org-1' };

    expect(queryKeys.conversations.list(firstIdentity)).toEqual([
      'agent-os', 'conversations', 'identity', 'user-1', 'org-1', 'list',
    ]);
    expect(queryKeys.conversations).not.toHaveProperty('history');
    expect(queryKeys.conversations.readiness(firstIdentity)).toEqual([
      'agent-os', 'conversations', 'identity', 'user-1', 'org-1', 'readiness',
    ]);
    expect(queryKeys.conversations.preferences(firstIdentity)).toEqual([
      'agent-os', 'conversations', 'identity', 'user-1', 'org-1', 'preferences',
    ]);
    expect(queryKeys.conversations.invocation(firstIdentity, 'invocation-1')).toEqual([
      'agent-os', 'conversations', 'identity', 'user-1', 'org-1', 'invocation', 'invocation-1',
    ]);
    expect(queryKeys.conversations.list(firstIdentity)).not.toEqual(
      queryKeys.conversations.list(secondIdentity),
    );
  });
});

describe('retired inventory route query keys', () => {
  it('removes unshipped and keeps warehouse reference lookup', () => {
    expect(queryKeys).not.toHaveProperty('unshipped');
    expect(queryKeys.warehouses).not.toHaveProperty('list');
    expect(queryKeys.warehouses.all).toEqual(['warehouses']);
  });
});

describe('retired order route query keys', () => {
  it('removes cache families with no active web consumer', () => {
    expect(queryKeys).not.toHaveProperty('cs');
    expect(queryKeys).not.toHaveProperty('returns');
    expect(queryKeys).not.toHaveProperty('picking');
    expect(queryKeys.orders).not.toHaveProperty('list');
    expect(queryKeys.orders).not.toHaveProperty('stats');
    expect(queryKeys.orders).not.toHaveProperty('search');
    expect(queryKeys.orders).not.toHaveProperty('compare');
    expect(queryKeys.orders).not.toHaveProperty('sync');
  });
});

describe('retired finance route query keys', () => {
  it('removes route-only finance cache families', () => {
    expect(queryKeys).not.toHaveProperty('manualLedger');
    expect(queryKeys).not.toHaveProperty('processingCosts');
    expect(queryKeys).not.toHaveProperty('supplierPayments');
    expect(queryKeys.settlements.list('2026-05')).toEqual([
      'settlements',
      'list',
      '2026-05',
    ]);
  });
});

describe('retired supplier registry query keys', () => {
  it('removes the supplier registry cache family', () => {
    expect(queryKeys).not.toHaveProperty('suppliers');
  });
});

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

describe('channel product matching query keys', () => {
  it('separates the queue, product candidates, and Sellpia match evidence', () => {
    expect(queryKeys.channelProductMappings.list({ channelAccountId: 'account-1' })).toEqual([
      'channelProductMappings', 'list', { channelAccountId: 'account-1' },
    ]);
    expect(queryKeys.channelProductMappings.productCandidates('listing-1', { search: 'KI-1' })).toEqual([
      'channelProductMappings', 'product-candidates', 'listing-1', { search: 'KI-1' },
    ]);
    expect(queryKeys.channelProductMappings.sellpiaManualMatchTargets()).toEqual([
      'channelProductMappings', 'sellpia-manual-match-targets',
    ]);
  });
});

describe('advertising query keys', () => {
  it('keeps campaign freshness separate from period campaign responses', () => {
    expect(queryKeys.ads.campaignSyncStatus()).toEqual([
      'ads',
      'campaign-sync-status',
    ]);
    expect(queryKeys.ads.campaignSyncStatus()).not.toEqual(
      queryKeys.ads.campaigns('sync-status'),
    );
  });

  it('keys Wing tracked-product history by its bounded day window', () => {
    expect(queryKeys.sourcing.wingTrackedHistories(30)).toEqual([
      'sourcing',
      'wing-tracked-products',
      'history',
      30,
    ]);
    expect(queryKeys.sourcing.wingTrackedSourceStatus()).toEqual([
      'sourcing',
      'wing-tracked-products',
      'source-status',
    ]);
  });
});

describe('product operations query keys', () => {
  it('keeps product operations lists, details, and mutations in one family', () => {
    expect(queryKeys.products.operations.all).toEqual(['products', 'operations']);
    expect(queryKeys.products.operations.lists()).toEqual([
      'products',
      'operations',
      'list',
    ]);
    expect(queryKeys.products.operations.list({ page: '2', periodDays: '30' })).toEqual([
      'products',
      'operations',
      'list',
      { page: '2', periodDays: '30' },
    ]);
    expect(queryKeys.products.operations.detail('product-1')).toEqual([
      'products',
      'operations',
      'detail',
      'product-1',
    ]);
    expect(queryKeys.products.operations.mutations()).toEqual([
      'products',
      'operations',
      'mutation',
    ]);
    expect(queryKeys.products.operations.recipeCandidates({ search: 'SP-1', limit: '20' })).toEqual([
      'products',
      'operations',
      'recipe-component-candidates',
      { search: 'SP-1', limit: '20' },
    ]);
  });
});

describe('Sellpia authoritative inventory query keys', () => {
  it('does not expose the retired internal product-option key family', () => {
    expect(queryKeys).not.toHaveProperty('productOptions');
    expect(queryKeys.inventory).not.toHaveProperty('receiptBatches');
  });

  it('keeps snapshots, assets, history, and availability in independently invalidatable families', () => {
    expect(queryKeys.inventory.snapshots()).toEqual(['inventory', 'sellpia-skus']);
    expect(queryKeys.inventory.snapshot({ page: '2', query: 'SP-1' })).toEqual([
      'inventory',
      'sellpia-skus',
      { page: '2', query: 'SP-1' },
    ]);
    expect(queryKeys.inventory.assets()).toEqual(['inventory', 'sellpia-assets']);
    expect(queryKeys.inventory.assetList({ page: '2', limit: '50' })).toEqual([
      'inventory',
      'sellpia-assets',
      { page: '2', limit: '50' },
    ]);
    expect(queryKeys.inventory.importRuns()).toEqual(['inventory', 'sellpia-import-runs']);
    expect(queryKeys.inventory.freshness()).toEqual(['inventory', 'sellpia-freshness']);
    expect(queryKeys.inventory.currentBasis()).toEqual(['inventory', 'sellpia-current-basis']);
    expect(queryKeys.inventory.history()).toEqual(['inventory', 'sellpia-history']);
    expect(queryKeys.inventory.historyList({ page: '1', limit: '20' })).toEqual([
      'inventory',
      'sellpia-history',
      { page: '1', limit: '20' },
    ]);
    expect(queryKeys.channelSkuAvailability.lists()).toEqual([
      'channelSkuAvailability',
      'list',
    ]);
  });
});
