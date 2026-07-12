import { describe, expect, it, vi } from 'vitest';
import {
  findAutoBatchCandidates,
  findGenerationMasters,
  findGenerationOrThrow,
  findGenerationRows,
  findJobMaster,
  findJobMastersByIds,
  findProductForEditor,
} from '../thumbnail-generation-ledger.query';
import { LEGACY_FAMILY_MASTER_SCOPE } from '../../../../../common/legacy-family-master-scope';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

describe('thumbnail-generation query filters', () => {
  it('keeps staged Sellpia identities out of all thumbnail family lookups', async () => {
    const prisma = {
      masterProduct: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await findProductForEditor(prisma as never, 'master-1', ORG);
    await findGenerationMasters(prisma as never, [{ masterId: 'master-1' }], ORG);
    await findJobMaster(prisma as never, 'master-1', ORG);
    await findJobMastersByIds(prisma as never, ['master-1'], ORG);
    await findAutoBatchCandidates(prisma as never, ORG, 5);

    for (const [query] of prisma.masterProduct.findFirst.mock.calls) {
      expect(query.where).toEqual(expect.objectContaining(LEGACY_FAMILY_MASTER_SCOPE));
    }
    for (const [query] of prisma.masterProduct.findMany.mock.calls.slice(0, -1)) {
      expect(query.where).toEqual(expect.objectContaining(LEGACY_FAMILY_MASTER_SCOPE));
    }
    expect(prisma.masterProduct.findMany.mock.calls.at(-1)?.[0].where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          LEGACY_FAMILY_MASTER_SCOPE,
          { OR: [{ imageUrl: { not: null } }, { thumbnailUrl: { not: null } }] },
        ]),
      }),
    );
  });

  it('lists only active candidate-bound generations', async () => {
    const prisma = {
      thumbnailGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    await findGenerationRows(prisma as never, ORG, { sourceCandidateId: CANDIDATE_ID });

    expect(prisma.thumbnailGeneration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORG,
        isDeleted: false,
        sourceCandidateId: CANDIDATE_ID,
      },
    }));
  });

  it('can explicitly list ownerless direct-upload generations', async () => {
    const prisma = {
      thumbnailGeneration: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const opts = { scope: 'direct-upload' as const };
    await findGenerationRows(prisma as never, ORG, opts);

    expect(prisma.thumbnailGeneration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organizationId: ORG,
        isDeleted: false,
        masterId: null,
        sourceCandidateId: null,
        contentWorkspaceId: null,
      },
    }));
  });

  it('single-generation reads ignore archived rows', async () => {
    const prisma = {
      thumbnailGeneration: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    await expect(findGenerationOrThrow(prisma as never, GENERATION_ID, ORG)).rejects.toThrow(
      `ThumbnailGeneration ${GENERATION_ID} not found`,
    );
    expect(prisma.thumbnailGeneration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: GENERATION_ID, organizationId: ORG, isDeleted: false },
    }));
  });
});
