import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailAnalysisRepositoryAdapter } from './thumbnail-analysis.repository.adapter';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('ThumbnailAnalysisRepositoryAdapter', () => {
  const findMany = vi.fn().mockResolvedValue([]);
  const repository = new ThumbnailAnalysisRepositoryAdapter({
    contentWorkspace: { findMany },
  } as never);

  beforeEach(() => {
    findMany.mockClear();
  });

  it('limits every product-backed analysis path to active registered Coupang workspaces', async () => {
    await repository.findAllAnalysisWorkspaces(ORGANIZATION_ID);
    await repository.findWorkspaceForAnalysis(WORKSPACE_ID, ORGANIZATION_ID);
    await repository.findWorkspacesForBatch([WORKSPACE_ID], ORGANIZATION_ID);
    await repository.findWorkspacesForPreInspect([WORKSPACE_ID], ORGANIZATION_ID);
    await repository.findRecomposeWorkspace(WORKSPACE_ID, ORGANIZATION_ID);

    expect(findMany).toHaveBeenCalledTimes(5);
    for (const [query] of findMany.mock.calls) {
      expect(query).toEqual(expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          ownerType: 'channel_listing',
          status: 'active',
          isDeleted: false,
          channelListingId: { not: null },
          channelListing: {
            is: {
              organizationId: ORGANIZATION_ID,
              isActive: true,
              channelAccount: {
                is: {
                  organizationId: ORGANIZATION_ID,
                  channel: 'coupang',
                },
              },
            },
          },
        }),
      }));
    }
  });
});
