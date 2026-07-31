import { ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_MASTER_PRODUCT_ABC_POLICY,
  type MasterProductAbcRecalculationResult,
} from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_ABC_METRIC_READ_PORT,
  type MasterProductAbcMetricReadPort,
} from '../../../analytics/application/port/in/master-product-abc-metric-read.port';
import { calculateMasterProductAbcEvaluations } from '../../domain/master-product-abc';
import {
  MASTER_PRODUCT_ABC_REPOSITORY_PORT,
  type MasterProductAbcPolicyRecord,
  type MasterProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';

const DEFAULT_POLICY: MasterProductAbcPolicyRecord = {
  ...DEFAULT_MASTER_PRODUCT_ABC_POLICY,
  revision: 0,
  lastCalculatedAt: null,
  sourceCapturedAt: null,
};

@Injectable()
export class MasterProductAbcService {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_REPOSITORY_PORT)
    private readonly repository: MasterProductAbcRepositoryPort,
    @Inject(MASTER_PRODUCT_ABC_METRIC_READ_PORT)
    private readonly metrics: MasterProductAbcMetricReadPort,
  ) {}

  async recalculate(organizationId: string): Promise<MasterProductAbcRecalculationResult> {
    const policy = await this.getPolicyRecord(organizationId);
    const first = await this.recalculateWithPolicy(organizationId, policy);
    if (!first.stale) return first.result;
    const latestPolicy = await this.getPolicyRecord(organizationId);
    const retry = await this.recalculateWithPolicy(organizationId, latestPolicy);
    if (retry.stale) {
      throw new ConflictException('MasterProduct ABC publication changed during recalculation');
    }
    return retry.result;
  }

  private async recalculateWithPolicy(
    organizationId: string,
    policy: MasterProductAbcPolicyRecord,
  ): Promise<{ result: MasterProductAbcRecalculationResult; stale: boolean }> {
    const snapshot = await this.metrics.readMetricSnapshot({
      organizationId,
      metric: policy.metric,
      periodDays: policy.periodDays,
    });
    const calculatedAt = new Date();
    const publication = calculateMasterProductAbcEvaluations(policy, snapshot.evidence, {
      calculatedAt,
      sourceCapturedAt: snapshot.sourceCapturedAt,
    });
    const metricValues = new Map([...publication.evaluations.entries()].map(([
      masterProductId,
      evaluation,
    ]) => [masterProductId, evaluation.rankingValue]));
    const published = await this.repository.publishGrades({
      organizationId,
      policy,
      sourceCapturedAt: snapshot.sourceCapturedAt,
      grades: publication.grades,
      evaluations: publication.evaluations,
      metricValues,
      allowPolicyReplacement: true,
    });
    const gradeItems = [...publication.grades.entries()].map(([masterProductId, abcGrade]) => ({
      masterProductId,
      abcGrade,
      evaluation: publication.evaluations.get(masterProductId) ?? null,
    }));
    return {
      stale: published.stale,
      result: {
        changedProductCount: published.changedProductCount,
        classifiedProductCount: gradeItems.filter(({ abcGrade }) => abcGrade !== null).length,
        unclassifiedProductCount: gradeItems.filter(({ abcGrade }) => abcGrade === null).length,
        grades: gradeItems,
      },
    };
  }

  private async getPolicyRecord(
    organizationId: string,
  ): Promise<MasterProductAbcPolicyRecord> {
    const persisted = await this.repository.findPolicy(organizationId);
    return persisted
      ? { ...persisted, ...DEFAULT_MASTER_PRODUCT_ABC_POLICY }
      : DEFAULT_POLICY;
  }
}
