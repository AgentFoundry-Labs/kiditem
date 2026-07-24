import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  MasterProductAbcPolicySchema,
  type MasterProductAbcPolicy,
  type MasterProductAbcPolicyResponse,
  type MasterProductAbcRecalculationResult,
} from '@kiditem/shared/product-abc';
import {
  MASTER_PRODUCT_ABC_METRIC_READ_PORT,
  type MasterProductAbcMetricReadPort,
} from '../../../analytics/application/port/in/master-product-abc-metric-read.port';
import { calculateMasterProductAbcGrades } from '../../domain/master-product-abc';
import {
  MASTER_PRODUCT_ABC_REPOSITORY_PORT,
  type MasterProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';

const DEFAULT_POLICY: MasterProductAbcPolicy = {
  metric: 'SALES_QUANTITY',
  periodDays: 30,
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
};

@Injectable()
export class MasterProductAbcService {
  constructor(
    @Inject(MASTER_PRODUCT_ABC_REPOSITORY_PORT)
    private readonly repository: MasterProductAbcRepositoryPort,
    @Inject(MASTER_PRODUCT_ABC_METRIC_READ_PORT)
    private readonly metrics: MasterProductAbcMetricReadPort,
  ) {}

  async getPolicy(organizationId: string): Promise<MasterProductAbcPolicyResponse> {
    return (await this.repository.findPolicy(organizationId)) ?? {
      ...DEFAULT_POLICY,
      lastCalculatedAt: null,
      sourceCapturedAt: null,
    };
  }

  async updatePolicy(organizationId: string, rawInput: unknown) {
    const parsed = MasterProductAbcPolicySchema.safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException('Invalid MasterProduct ABC policy');
    await this.repository.savePolicy(organizationId, parsed.data);
    const result = await this.recalculate(organizationId);
    return { policy: await this.getPolicy(organizationId), result };
  }

  async recalculate(organizationId: string): Promise<MasterProductAbcRecalculationResult> {
    const policy = await this.getPolicy(organizationId);
    const snapshot = await this.metrics.readMetricSnapshot({
      organizationId,
      metric: policy.metric,
      periodDays: policy.periodDays,
    });
    const grades = calculateMasterProductAbcGrades(policy, snapshot.evidence);
    const metricValues = new Map(snapshot.evidence.map((row) => [
      row.masterProductId,
      row.metricValue,
    ]));
    const published = await this.repository.publishGrades({
      organizationId,
      policy,
      sourceCapturedAt: snapshot.sourceCapturedAt,
      grades,
      metricValues,
    });
    const gradeItems = [...grades.entries()].map(([masterProductId, abcGrade]) => ({
      masterProductId,
      abcGrade,
    }));
    return {
      changedProductCount: published.changedProductCount,
      classifiedProductCount: gradeItems.filter(({ abcGrade }) => abcGrade !== null).length,
      unclassifiedProductCount: gradeItems.filter(({ abcGrade }) => abcGrade === null).length,
      grades: gradeItems,
    };
  }
}
