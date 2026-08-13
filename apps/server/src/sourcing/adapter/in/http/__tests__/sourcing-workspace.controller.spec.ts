import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceController } from '../sourcing-workspace.controller';

describe('SourcingWorkspaceController', () => {
  it('uses the authenticated organization for recommendation refresh and Wing ingest', async () => {
    const recommendations = {
      latest: vi.fn(async () => ({ status: 'ready' })),
      refresh: vi.fn(async () => ({ status: 'ready' })),
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
    const controller = new SourcingWorkspaceController(
      recommendations as never,
      wing as never,
      keywordPreferences as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const user = { id: '00000000-0000-4000-8000-000000000002' };

    await controller.listRecommendations({ surface: 'entry', limit: 20 }, organizationId);
    await controller.refreshRecommendations(organizationId);
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
    expect(recommendations.refresh).toHaveBeenCalledWith({ organizationId, limit: 50 });
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

  it('passes only authenticated organization and the attempt header to exact browser routes', async () => {
    const recommendations = { latest: vi.fn(), refresh: vi.fn() };
    const wing = {
      ingest: vi.fn(),
      ingestBrowserBatch: vi.fn(async () => ({ kind: 'committed' })),
      finalizeBrowserOperation: vi.fn(async () => ({ finalized: true })),
      snapshot: vi.fn(async () => ({ keyword: '슬라임', items: [] })),
    };
    const controller = new SourcingWorkspaceController(
      recommendations as never,
      wing as never,
      { list: vi.fn(), save: vi.fn() } as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const runId = '00000000-0000-4000-8000-000000000010';
    const attemptToken = '00000000-0000-4000-8000-000000000011';
    const batch = {
      keyword: '슬라임',
      maxPages: 2,
      purpose: 'catalog_search',
      items: [{
        productId: '123', itemId: null, vendorItemId: null, productName: '슬라임', itemName: null,
        brandName: null, manufacture: null, categoryHierarchy: null, imagePath: null, salePriceKrw: null,
        ratingAverage: null, ratingCount: null, viewsLast28d: null, salesLast28d: null,
        estimatedRevenue28d: null, conversionRate28d: null, deliveryInfo: null,
        sourceKeyword: '슬라임', capturedAt: '2026-08-14T00:00:00.000Z',
      }],
    };
    const finalization = {
      purpose: 'catalog_search',
      keywords: [{ keyword: '슬라임', outcome: 'complete', discovered: 1, accepted: 1, duplicate: 0, failed: 0 }],
    };

    await controller.ingestBrowserCoupangObservations(runId, attemptToken, batch, organizationId);
    await controller.finalizeBrowserOperation(runId, attemptToken, finalization, organizationId);
    await controller.getWingCatalogSnapshot('슬라임', organizationId);

    expect(wing.ingestBrowserBatch).toHaveBeenCalledWith({
      organizationId,
      operationRunId: runId,
      attemptToken,
      batch,
    });
    expect(wing.finalizeBrowserOperation).toHaveBeenCalledWith({
      organizationId,
      operationRunId: runId,
      attemptToken,
      finalization,
    });
    expect(wing.snapshot).toHaveBeenCalledWith({ organizationId, keyword: '슬라임' });

    expect(() => controller.ingestBrowserCoupangObservations(
      runId,
      attemptToken,
      { ...batch, organizationId: 'forged' },
      organizationId,
    )).toThrow('invalid_wing_catalog_observations');
  });
});
