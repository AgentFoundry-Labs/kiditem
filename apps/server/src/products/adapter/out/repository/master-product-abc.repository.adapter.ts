import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ProductAbcGrade } from '@kiditem/shared/product-abc';
import type {
  MasterProductAbcPolicyRecord,
  MasterProductAbcRepositoryPort,
} from '../../../application/port/out/repository/master-product-abc.repository.port';

@Injectable()
export class MasterProductAbcRepositoryAdapter implements MasterProductAbcRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findPolicy(organizationId: string): Promise<MasterProductAbcPolicyRecord | null> {
    const row = await this.prisma.masterProductAbcPolicy.findUnique({ where: { organizationId } });
    return row ? toPolicy(row) : null;
  }

  async savePolicy(organizationId: string, policy: Omit<MasterProductAbcPolicyRecord, 'lastCalculatedAt' | 'sourceCapturedAt'>) {
    const row = await this.prisma.masterProductAbcPolicy.upsert({
      where: { organizationId },
      create: { organizationId, ...policy },
      update: { ...policy },
    });
    return toPolicy(row);
  }

  async publishGrades(input: {
    organizationId: string;
    policy: MasterProductAbcPolicyRecord;
    sourceCapturedAt: Date | null;
    grades: ReadonlyMap<string, ProductAbcGrade | null>;
    metricValues: ReadonlyMap<string, number | null>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const ids = [...input.grades.keys()].sort();
      const current = ids.length === 0 ? [] : await tx.masterProduct.findMany({
        where: { organizationId: input.organizationId, id: { in: ids } },
        select: { id: true, abcGrade: true },
      });
      const changed = current.flatMap((row) => {
        const nextGrade = input.grades.get(row.id) ?? null;
        return row.abcGrade === nextGrade ? [] : [{ id: row.id, oldGrade: row.abcGrade, newGrade: nextGrade }];
      });
      const calculatedAt = new Date();
      const applied: typeof changed = [];
      for (const row of changed) {
        const update = await tx.masterProduct.updateMany({
          where: { id: row.id, organizationId: input.organizationId, abcGrade: row.oldGrade },
          data: { abcGrade: row.newGrade },
        });
        if (update.count === 1) applied.push(row);
      }
      if (applied.length > 0) {
        await tx.masterProductAbcGradeHistory.createMany({
          data: applied.map((row) => ({
            organizationId: input.organizationId,
            masterProductId: row.id,
            oldGrade: row.oldGrade,
            newGrade: row.newGrade,
            metric: input.policy.metric,
            periodDays: input.policy.periodDays,
            metricValue: input.metricValues.get(row.id) ?? null,
            calculatedAt,
          })),
        });
      }
      const policy = await tx.masterProductAbcPolicy.upsert({
        where: { organizationId: input.organizationId },
        create: {
          organizationId: input.organizationId,
          metric: input.policy.metric,
          periodDays: input.policy.periodDays,
          aCumulativeThreshold: input.policy.aCumulativeThreshold,
          bCumulativeThreshold: input.policy.bCumulativeThreshold,
          lastCalculatedAt: calculatedAt,
          sourceCapturedAt: input.sourceCapturedAt,
        },
        update: { lastCalculatedAt: calculatedAt, sourceCapturedAt: input.sourceCapturedAt },
      });
      return { changedProductCount: applied.length, policy: toPolicy(policy) };
    });
  }
}

function toPolicy(row: {
  metric: string; periodDays: number; aCumulativeThreshold: number; bCumulativeThreshold: number;
  lastCalculatedAt: Date | null; sourceCapturedAt: Date | null;
}): MasterProductAbcPolicyRecord {
  return {
    metric: row.metric as MasterProductAbcPolicyRecord['metric'],
    periodDays: row.periodDays as MasterProductAbcPolicyRecord['periodDays'],
    aCumulativeThreshold: row.aCumulativeThreshold,
    bCumulativeThreshold: row.bCumulativeThreshold,
    lastCalculatedAt: row.lastCalculatedAt,
    sourceCapturedAt: row.sourceCapturedAt,
  };
}
