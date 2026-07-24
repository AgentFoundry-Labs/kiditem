import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import {
  MasterProductAbcPolicySchema,
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
  type MasterProductAbcPolicyRecord,
  type MasterProductAbcRepositoryPort,
} from '../port/out/repository/master-product-abc.repository.port';

const DEFAULT_POLICY: MasterProductAbcPolicyRecord = {
  metric: 'SALES_QUANTITY',
  periodDays: 30,
  aCumulativeThreshold: 70,
  bCumulativeThreshold: 90,
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

  async getPolicy(organizationId: string): Promise<MasterProductAbcPolicyResponse> {
    return publicPolicy(await this.getPolicyRecord(organizationId));
  }

  async updatePolicy(organizationId: string, rawInput: unknown) {
    const parsed = MasterProductAbcPolicySchema.safeParse(rawInput);
    if (!parsed.success) throw new BadRequestException('Invalid MasterProduct ABC policy');
    const current = await this.getPolicyRecord(organizationId);
    const first = await this.recalculateWithPolicy(
      organizationId,
      { ...current, ...parsed.data },
      true,
    );
    if (!first.stale) return publicPublication(first);
    const latest = await this.getPolicyRecord(organizationId);
    const retry = await this.recalculateWithPolicy(
      organizationId,
      { ...latest, ...parsed.data },
      true,
    );
    if (retry.stale) {
      throw new ConflictException('MasterProduct ABC publication changed during policy update');
    }
    return publicPublication(retry);
  }

  async recalculate(organizationId: string): Promise<MasterProductAbcRecalculationResult> {
    const policy = await this.getPolicyRecord(organizationId);
    const first = await this.recalculateWithPolicy(organizationId, policy);
    if (!first.stale) return first.result;
    const latestPolicy = await this.getPolicyRecord(organizationId);
    const retry = await this.recalculateWithPolicy(organizationId, latestPolicy);
    if (retry.stale) {
      throw new ConflictException('MasterProduct ABC policy changed during recalculation');
    }
    return retry.result;
  }

  private async recalculateWithPolicy(
    organizationId: string,
    policy: MasterProductAbcPolicyRecord,
    allowPolicyReplacement = false,
  ): Promise<{ policy: MasterProductAbcPolicyRecord; result: MasterProductAbcRecalculationResult; stale: boolean }> {
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
      allowPolicyReplacement,
    });
    const gradeItems = [...grades.entries()].map(([masterProductId, abcGrade]) => ({
      masterProductId,
      abcGrade,
    }));
    return {
      policy: published.policy,
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
    return (await this.repository.findPolicy(organizationId)) ?? DEFAULT_POLICY;
  }
}

function publicPolicy(policy: MasterProductAbcPolicyRecord): MasterProductAbcPolicyResponse {
  const { revision: _revision, ...response } = policy;
  return response;
}

function publicPublication(input: {
  policy: MasterProductAbcPolicyRecord;
  result: MasterProductAbcRecalculationResult;
  stale: boolean;
}) {
  return { ...input, policy: publicPolicy(input.policy) };
}
