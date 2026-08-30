import { describe, expect, it, vi } from 'vitest';
import { SourcingWorkspaceController } from '../sourcing-workspace.controller';

describe('SourcingWorkspaceController', () => {
  it('uses the authenticated organization for persisted recommendation reads and Wing ingest', async () => {
    const recommendations = {
      latest: vi.fn(async () => ({ status: 'ready' })),
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
      { ingestBrowserBatch: vi.fn(), snapshot: vi.fn() } as never,
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

  it('routes keyword suggestion writes through the exact attempt token and keeps reads tenant scoped', async () => {
    const keywordSuggestions = {
      ingestBrowserBatch: vi.fn(async () => ({
        published: true,
        acceptedCount: 1,
        duplicate: false,
      })),
      snapshot: vi.fn(async () => ({
        keyword: 'A Pencil',
        generatedAt: null,
        sourceKey: 'coupang.keyword_suggestion',
        schemaVersion: 'coupang-keyword-suggestion/v1',
        items: [],
        productNameTokens: [],
      })),
    };
    const controller = new SourcingWorkspaceController(
      { latest: vi.fn(), refresh: vi.fn() } as never,
      { ingest: vi.fn(), ingestBrowserBatch: vi.fn(), finalizeBrowserOperation: vi.fn(), snapshot: vi.fn() } as never,
      keywordSuggestions as never,
      { list: vi.fn(), save: vi.fn() } as never,
    );
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const runId = '00000000-0000-4000-8000-000000000010';
    const attemptToken = '00000000-0000-4000-8000-000000000011';
    const suggestionBatch = {
      keyword: 'A Pencil',
      capturedAt: '2026-08-14T00:00:30.000Z',
      items: [{ rank: 1, keyword: '아동 연필', source: 'coupang-autocomplete' }],
      productNameTokens: [{ keyword: '연필', count: 4 }],
    };

    await controller.ingestBrowserKeywordSuggestions(
      runId,
      attemptToken,
      suggestionBatch,
      organizationId,
    );
    await controller.getKeywordSuggestionSnapshot('  Ａ Pencil ', organizationId);

    expect(keywordSuggestions.ingestBrowserBatch).toHaveBeenCalledWith({
      organizationId,
      operationRunId: runId,
      attemptToken,
      batch: suggestionBatch,
    });
    expect(keywordSuggestions.snapshot).toHaveBeenCalledWith({
      organizationId,
      keyword: 'A Pencil',
    });
    expect(() => controller.ingestBrowserKeywordSuggestions(
      runId,
      attemptToken,
      { ...suggestionBatch, organizationId: 'forged' },
      organizationId,
    )).toThrow('invalid_keyword_suggestion_observations');
    expect(() => controller.ingestBrowserKeywordSuggestions(
      runId,
      undefined,
      suggestionBatch,
      organizationId,
    )).toThrow('invalid_operation_attempt_token');
  });
});
