import type { DataMigration } from '../types';

const legacyCandidateWhere = {
  isActive: false,
  originChannelListingId: { not: null },
  inventorySkus: { none: {} },
};

const protectedReferenceFilters = [
  { abcGrade: { not: null } },
  { channelListings: { some: {} } },
  { provenanceCandidate: { isNot: null } },
  { abcEvaluation: { isNot: null } },
  { abcGradeHistories: { some: {} } },
];

export const deleteLegacyChannelDerivedMasterProducts: DataMigration = {
  id: 'v0.1.30:006_delete_legacy_channel_derived_master_products',
  releaseVersion: '0.1.30',
  name: 'Delete unreferenced legacy channel-derived MasterProducts',
  phase: 'post-schema',
  async run(tx) {
    const [candidateCount, protectedReferenceCount] = await Promise.all([
      tx.masterProduct.count({ where: legacyCandidateWhere }),
      tx.masterProduct.count({
        where: {
          ...legacyCandidateWhere,
          OR: protectedReferenceFilters,
        },
      }),
    ]);

    if (protectedReferenceCount > 0) {
      throw new Error(
        'Refusing legacy MasterProduct cleanup: '
        + `${protectedReferenceCount} candidate(s) retain a protected reference.`,
      );
    }

    if (candidateCount === 0) {
      return {
        affectedRows: 0,
        details: {
          candidateCount: 0,
          deletedLegacyMasterProductCount: 0,
          protectedReferenceCount: 0,
        },
      };
    }

    const deleted = await tx.masterProduct.deleteMany({
      where: {
        ...legacyCandidateWhere,
        abcGrade: null,
        channelListings: { none: {} },
        provenanceCandidate: { is: null },
        abcEvaluation: { is: null },
        abcGradeHistories: { none: {} },
      },
    });
    if (deleted.count !== candidateCount) {
      throw new Error(
        `Legacy MasterProduct cleanup expected to delete ${candidateCount} rows `
        + `but deleted ${deleted.count}.`,
      );
    }

    return {
      affectedRows: deleted.count,
      details: {
        candidateCount,
        deletedLegacyMasterProductCount: deleted.count,
        protectedReferenceCount,
      },
    };
  },
};
