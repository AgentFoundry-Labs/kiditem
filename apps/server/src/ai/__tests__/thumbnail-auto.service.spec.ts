import { describe, expect, it, vi } from 'vitest';
import { ThumbnailAutoService } from '../application/service/thumbnail-auto.service';

const ORGANIZATION_ID = 'organization-1';

const batchResult = {
  attempted: 1,
  succeeded: 1,
  failed: 0,
  skipped: 0,
  runs: [{ ok: true, contentWorkspaceId: 'product-1', generationId: 'generation-1' }],
};

function makeService() {
  const generationService = {
    createAutoBatch: vi.fn(async () => batchResult),
  };
  const service = new ThumbnailAutoService(generationService as never);
  return { service, generationService };
}

describe('ThumbnailAutoService', () => {
  it('runs the auto batch directly without creating a synthetic Agent OS request', async () => {
    const { service, generationService } = makeService();

    const result = await service.runBatch(ORGANIZATION_ID, 'user-1', 5);

    // Per-generation operation alerts now own completion tracking — runBatch
    // forwards the actor through createAutoBatch instead of opening a cohort
    // alert that would lie about completion (see PR #209 review).
    expect(generationService.createAutoBatch).toHaveBeenCalledWith(ORGANIZATION_ID, 5, 'user-1');
    expect(result).toEqual(batchResult);
  });
});
