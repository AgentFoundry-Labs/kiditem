import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceController } from '../sourcing-workspace.controller';

describe('SourcingWorkspaceController', () => {
  it('uses the authenticated organization for persisted recommendation reads and Wing ingest', async () => {
    const recommendations = {
      latest: vi.fn(async () => ({ ready: true })),
    };
    const wing = {
      ingest: vi.fn(async () => ({ kind: 'committed' })),
      ingestBrowserBatch: vi.fn(async () => ({ kind: 'committed' })),
      finalizeBrowserOperation: vi.fn(async () => ({ finalized: true })),
      snapshot: vi.fn(async () => ({ keyword: '슬라임', items: [] })),
    };
    const keywordPreferences = {
      list: vi.fn(async () => []),
      save: vi.fn(async () => ({ keyword: '유아 우산', excluded: true, version: 1 })),
    };
    const keywordSuggestions = {
      ingestBrowserBatch: vi.fn(),
      snapshot: vi.fn(),
    };
    const controller = new SourcingWorkspaceController(
      recommendations as never,
      wing as never,
      keywordSuggestions as never,
      keywordPreferences as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const user = { id: '00000000-0000-4000-8000-000000000002' };

    await controller.listRecommendations({ surface: 'entry', limit: 20 }, organizationId);
    await controller.ingestCoupangObservations(
      {
        idempotencyKey: '00000000-0000-4000-8000-000000000003',
        items: [],
      } as never,
      organizationId,
      user as never,
    );
    await controller.listKeywordPreferences(organizationId);
    await controller.saveKeywordPreference(
      { keyword: '유아 우산' },
      { excluded: true, expectedVersion: 0 },
      organizationId,
    );

    expect(recommendations.latest).toHaveBeenCalledWith({ organizationId, surface: 'entry', limit: 20 });
    expect(wing.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, actorUserId: user.id }),
    );
    expect(keywordPreferences.list).toHaveBeenCalledWith(organizationId);
    expect(keywordPreferences.save).toHaveBeenCalledWith({
      organizationId,
      keyword: '유아 우산',
      excluded: true,
      expectedVersion: 0,
    });
  });

  it('serves only keyword-suggestion snapshots; collection runs as the sourcing.coupang_keyword_suggestion operation', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const source = { snapshot: vi.fn(async () => ({ items: [] })) };
    const controller = new SourcingWorkspaceController({} as never, {} as never,
      source as never, {} as never);
    for (const retired of ['beginKeywordSuggestions', 'completeKeywordSuggestions', 'readKeywordSuggestions',
      'failKeywordSuggestions', 'beginWingCatalog', 'uploadWingCatalog', 'completeWingCatalog', 'cancelWingCatalog']) {
      expect(SourcingWorkspaceController.prototype).not.toHaveProperty(retired);
    }
    await controller.getKeywordSuggestionSnapshot('  Ａ Pencil ', organizationId);
    expect(source.snapshot).toHaveBeenCalledWith({ organizationId, keyword: 'A Pencil' });
  });

  it('refreshes Wing recommendations only from a published market-analysis Wing operation', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const sourceOperationId = '00000000-0000-4000-8000-000000000020';
    const recommendations = { refresh: vi.fn(async () => ({ ok: true })) };
    const wing = { publishedPurpose: vi.fn(async (): Promise<string | null> => 'market_analysis') };
    const controller = new SourcingWorkspaceController(recommendations as never, wing as never, {} as never, {} as never);
    await controller.refreshWingRecommendations(organizationId, { sourceOperationId });
    expect(wing.publishedPurpose).toHaveBeenCalledWith({ organizationId, operationId: sourceOperationId });
    expect(recommendations.refresh).toHaveBeenCalledWith({ organizationId, limit: 50,
      idempotencyKey: `wing-source:${sourceOperationId}:recommendations` });

    wing.publishedPurpose.mockResolvedValueOnce('catalog_search');
    await expect(controller.refreshWingRecommendations(organizationId, { sourceOperationId }))
      .rejects.toThrow('WING_RECOMMENDATION_SOURCE_NOT_COMPLETE');
    wing.publishedPurpose.mockResolvedValueOnce(null);
    await expect(controller.refreshWingRecommendations(organizationId, { sourceOperationId }))
      .rejects.toThrow('WING_RECOMMENDATION_SOURCE_NOT_COMPLETE');
  });
});
