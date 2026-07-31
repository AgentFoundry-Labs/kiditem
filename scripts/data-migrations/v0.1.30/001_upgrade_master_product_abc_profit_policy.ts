import { DEFAULT_MASTER_PRODUCT_ABC_POLICY } from '@kiditem/shared/product-abc';
import type { DataMigration } from '../types';

type LegacyPolicy = {
  organizationId: string;
  metric: string;
  periodDays: number;
  aCumulativeThreshold: number;
  bCumulativeThreshold: number;
  minProvisionalMonths: number;
  minClassifiedMonths: number;
};

function needsGrossProfitUpgrade(policy: LegacyPolicy): boolean {
  return policy.metric !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.metric
    || policy.periodDays !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.periodDays
    || policy.aCumulativeThreshold !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.aCumulativeThreshold
    || policy.bCumulativeThreshold !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.bCumulativeThreshold
    || policy.minProvisionalMonths !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.minProvisionalMonths
    || policy.minClassifiedMonths !== DEFAULT_MASTER_PRODUCT_ABC_POLICY.minClassifiedMonths;
}

/**
 * Legacy official grades do not carry the order-time cost evidence required by
 * the gross-profit policy. Preserve the prior policy in immutable history,
 * then invalidate only grades whose organization policy changed.
 */
export const upgradeMasterProductAbcProfitPolicy: DataMigration = {
  id: 'v0.1.30:001_upgrade_master_product_abc_profit_policy',
  releaseVersion: '0.1.30',
  name: 'Upgrade MasterProduct ABC policies to gross profit',
  async run(tx) {
    const policies = await tx.masterProductAbcPolicy.findMany({
      select: {
        organizationId: true,
        metric: true,
        periodDays: true,
        aCumulativeThreshold: true,
        bCumulativeThreshold: true,
        minProvisionalMonths: true,
        minClassifiedMonths: true,
      },
    });
    const legacyPolicies = policies.filter(needsGrossProfitUpgrade);
    const organizationIds = legacyPolicies.map(({ organizationId }) => organizationId);

    if (organizationIds.length === 0) {
      return {
        affectedRows: 0,
        details: {
          upgradedPolicyCount: 0,
          clearedLegacyGradeCount: 0,
          createdGradeHistoryCount: 0,
        },
      };
    }

    const previousPolicyByOrganization = new Map(
      legacyPolicies.map((policy) => [policy.organizationId, policy]),
    );
    const legacyGrades = await tx.masterProduct.findMany({
      where: {
        organizationId: { in: organizationIds },
        abcGrade: { not: null },
      },
      select: { id: true, organizationId: true, abcGrade: true },
    });
    const calculatedAt = new Date();
    const histories = legacyGrades.map((product) => {
      const policy = previousPolicyByOrganization.get(product.organizationId)!;
      return {
        organizationId: product.organizationId,
        masterProductId: product.id,
        oldGrade: product.abcGrade,
        newGrade: null,
        metric: policy.metric,
        periodDays: policy.periodDays,
        metricValue: null,
        calculatedAt,
      };
    });
    const [upgraded, cleared, history] = await Promise.all([
      tx.masterProductAbcPolicy.updateMany({
        where: { organizationId: { in: organizationIds } },
        data: {
          ...DEFAULT_MASTER_PRODUCT_ABC_POLICY,
          revision: { increment: 1 },
          lastCalculatedAt: null,
          sourceCapturedAt: null,
        },
      }),
      tx.masterProduct.updateMany({
        where: {
          organizationId: { in: organizationIds },
          abcGrade: { not: null },
        },
        data: { abcGrade: null },
      }),
      histories.length === 0
        ? Promise.resolve({ count: 0 })
        : tx.masterProductAbcGradeHistory.createMany({ data: histories }),
    ]);

    return {
      affectedRows: upgraded.count + cleared.count + history.count,
      details: {
        upgradedPolicyCount: upgraded.count,
        clearedLegacyGradeCount: cleared.count,
        createdGradeHistoryCount: history.count,
      },
    };
  },
};
