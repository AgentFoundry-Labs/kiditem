import { describe, expect, it, vi } from 'vitest';
import { dataMigrations } from '../data-migrations';
import { deleteLegacyChannelDerivedMasterProducts } from '../data-migrations/v0.1.30/006_delete_legacy_channel_derived_master_products';

const MIGRATION_ID = 'v0.1.30:006_delete_legacy_channel_derived_master_products';

function createTransaction(input: {
  candidateCount: number;
  protectedCount: number;
  deletedCount?: number;
}) {
  return {
    masterProduct: {
      count: vi.fn()
        .mockResolvedValueOnce(input.candidateCount)
        .mockResolvedValueOnce(input.protectedCount),
      deleteMany: vi.fn().mockResolvedValue({
        count: input.deletedCount ?? input.candidateCount,
      }),
    },
  };
}

describe('legacy channel-derived MasterProduct cleanup migration', () => {
  it('leaves the registry when the cached grade column it filters on is dropped', () => {
    // Release 0.1.30 has not reached main, so the registration goes without
    // inactive lineage; the applied source stays as it ran.
    expect(dataMigrations.map((migration) => migration.id)).not.toContain(MIGRATION_ID);
    expect(deleteLegacyChannelDerivedMasterProducts).toMatchObject({
      id: MIGRATION_ID,
      releaseVersion: '0.1.30',
      phase: 'post-schema',
    });
  });

  it('deletes only inactive channel-derived products without canonical or historical references', async () => {
    const tx = createTransaction({ candidateCount: 3, protectedCount: 0 });

    const result = await deleteLegacyChannelDerivedMasterProducts.run(tx as never);

    expect(tx.masterProduct.count).toHaveBeenNthCalledWith(1, {
      where: {
        isActive: false,
        originChannelListingId: { not: null },
        inventorySkus: { none: {} },
      },
    });
    expect(tx.masterProduct.count).toHaveBeenNthCalledWith(2, {
      where: {
        isActive: false,
        originChannelListingId: { not: null },
        inventorySkus: { none: {} },
        OR: [
          { abcGrade: { not: null } },
          { channelListings: { some: {} } },
          { provenanceCandidate: { isNot: null } },
          { abcEvaluation: { isNot: null } },
          { abcGradeHistories: { some: {} } },
        ],
      },
    });
    expect(tx.masterProduct.deleteMany).toHaveBeenCalledWith({
      where: {
        isActive: false,
        originChannelListingId: { not: null },
        inventorySkus: { none: {} },
        abcGrade: null,
        channelListings: { none: {} },
        provenanceCandidate: { is: null },
        abcEvaluation: { is: null },
        abcGradeHistories: { none: {} },
      },
    });
    expect(result).toEqual({
      affectedRows: 3,
      details: {
        candidateCount: 3,
        deletedLegacyMasterProductCount: 3,
        protectedReferenceCount: 0,
      },
    });
  });

  it('fails closed instead of deleting when any legacy candidate has a live or historical reference', async () => {
    const tx = createTransaction({ candidateCount: 3, protectedCount: 1 });

    await expect(
      deleteLegacyChannelDerivedMasterProducts.run(tx as never),
    ).rejects.toThrow(/protected reference/i);
    expect(tx.masterProduct.deleteMany).not.toHaveBeenCalled();
  });

  it('fails closed when the deleted count differs from the preflight count', async () => {
    const tx = createTransaction({
      candidateCount: 3,
      protectedCount: 0,
      deletedCount: 2,
    });

    await expect(
      deleteLegacyChannelDerivedMasterProducts.run(tx as never),
    ).rejects.toThrow(/expected to delete 3.*deleted 2/i);
  });

  it('is a no-op after the legacy rows are gone', async () => {
    const tx = createTransaction({ candidateCount: 0, protectedCount: 0 });

    await expect(
      deleteLegacyChannelDerivedMasterProducts.run(tx as never),
    ).resolves.toEqual({
      affectedRows: 0,
      details: {
        candidateCount: 0,
        deletedLegacyMasterProductCount: 0,
        protectedReferenceCount: 0,
      },
    });
    expect(tx.masterProduct.deleteMany).not.toHaveBeenCalled();
  });
});
