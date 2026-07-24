import type { DataMigration } from '../types';

const DEFAULT_POLICY = {
  metric: 'SALES_QUANTITY',
  periodDays: 30,
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
} as const;

/**
 * Establishes the policy row required before the automatic calculator is
 * enabled. Legacy ABC values are deliberately cleared rather than converted:
 * they may have been supplied manually and do not have reproducible evidence.
 */
export const initializeMasterProductAbcPolicy: DataMigration = {
  id: 'v0.1.26:001_initialize_master_product_abc_policy',
  releaseVersion: '0.1.26',
  name: 'Initialize automatic MasterProduct ABC policies',
  async run(tx) {
    const [organizations, existingPolicies] = await Promise.all([
      tx.organization.findMany({ select: { id: true } }),
      tx.masterProductAbcPolicy.findMany({ select: { organizationId: true } }),
    ]);
    const existingOrganizationIds = new Set(
      existingPolicies.map((policy) => policy.organizationId),
    );
    const missingPolicies = organizations
      .filter((organization) => !existingOrganizationIds.has(organization.id))
      .map((organization) => ({
        organizationId: organization.id,
        ...DEFAULT_POLICY,
      }));
    const created =
      missingPolicies.length === 0
        ? { count: 0 }
        : await tx.masterProductAbcPolicy.createMany({
            data: missingPolicies,
            skipDuplicates: true,
          });
    const cleared = await tx.masterProduct.updateMany({
      where: { abcGrade: { not: null } },
      data: { abcGrade: null },
    });

    return {
      affectedRows: created.count + cleared.count,
      details: {
        createdPolicyCount: created.count,
        clearedLegacyGradeCount: cleared.count,
      },
    };
  },
};
