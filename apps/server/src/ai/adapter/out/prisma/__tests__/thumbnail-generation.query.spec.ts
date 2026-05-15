import { describe, expect, it, vi } from 'vitest';
import {
  findGenerationOrThrow,
  findGenerationRows,
} from '../thumbnail-generation.query';

const ORG = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const GENERATION_ID = '33333333-3333-4333-8333-333333333333';

describe('thumbnail-generation query filters', () => {
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
