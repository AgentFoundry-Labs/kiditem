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

  it('exposes source owner endpoints and projects tokens out of terminal and read responses', async () => {
    const organizationId = '00000000-0000-4000-8000-000000000001';
    const attemptId = '00000000-0000-4000-8000-000000000010';
    const attemptToken = '00000000-0000-4000-8000-000000000011';
    const attempt = { attemptId, attemptToken, state: 'COMPLETE' };
    const source = { begin: vi.fn(async () => attempt), read: vi.fn(async () => attempt),
      complete: vi.fn(async () => attempt), fail: vi.fn(async () => attempt),
      status: vi.fn(async () => ({ latestAttempt: attempt, latestComplete: attempt })),
      snapshot: vi.fn(async () => ({ items: [] })) };
    const controller = new SourcingWorkspaceController({} as never, {} as never,
      source as never, {} as never);
    expect(SourcingWorkspaceController.prototype).not.toHaveProperty('ingestBrowserKeywordSuggestions');
    await expect(controller.beginKeywordSuggestions(organizationId, { id: 'user' } as never,
      'key', { keyword: 'A Pencil', maxResults: 30 })).resolves.toEqual(attempt);
    expect(source.begin).toHaveBeenCalledWith({ organizationId, requestedByUserId: 'user',
      idempotencyKey: 'key', input: { keyword: 'A Pencil', maxResults: 30 } });
    await expect(controller.completeKeywordSuggestions(attemptId, attemptToken, {}, organizationId))
      .resolves.toEqual({ attemptId, state: 'COMPLETE' });
    await expect(controller.readKeywordSuggestions(attemptId, organizationId))
      .resolves.toEqual({ attemptId, state: 'COMPLETE' });
    await expect(controller.failKeywordSuggestions(attemptId, attemptToken,
      { code: 'FAIL', message: 'provider' }, organizationId)).resolves.not.toHaveProperty('attemptToken');
    expect(() => controller.completeKeywordSuggestions(attemptId, undefined, {}, organizationId))
      .toThrow('INVALID_SOURCE_ATTEMPT_TOKEN');
    await controller.getKeywordSuggestionSnapshot('  Ａ Pencil ', organizationId);
    expect(source.snapshot).toHaveBeenCalledWith({ organizationId, keyword: 'A Pencil' });
  });
});
