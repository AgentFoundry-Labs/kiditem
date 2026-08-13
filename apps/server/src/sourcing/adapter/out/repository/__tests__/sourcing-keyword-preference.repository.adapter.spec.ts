import { describe, expect, it, vi } from 'vitest';
import { SourcingKeywordPreferenceRepositoryAdapter } from '../sourcing-keyword-preference.repository.adapter';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000001';

describe('SourcingKeywordPreferenceRepositoryAdapter', () => {
  it('uses a keyed compare-and-swap update rather than a workspace document replacement', async () => {
    const prisma = {
      sourcingKeywordPreference: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => preference()),
      },
    };
    const repository = new SourcingKeywordPreferenceRepositoryAdapter(prisma as never);

    await expect(repository.save({
      organizationId: ORGANIZATION_ID,
      keywordNormalized: '유아우산',
      displayKeyword: '유아 우산',
      excluded: true,
      expectedVersion: 1,
    })).resolves.toMatchObject({ kind: 'saved', preference: { version: 2 } });
    expect(prisma.sourcingKeywordPreference.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORGANIZATION_ID,
        keywordNormalized: '유아우산',
        version: 1,
      },
      data: {
        displayKeyword: '유아 우산',
        excluded: true,
        version: { increment: 1 },
      },
    });
  });
});

function preference() {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    organizationId: ORGANIZATION_ID,
    keywordNormalized: '유아우산',
    displayKeyword: '유아 우산',
    excluded: true,
    version: 2,
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
  };
}
