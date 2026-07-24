import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  async publishGrades(input: {
    organizationId: string;
    policy: MasterProductAbcPolicyRecord;
    sourceCapturedAt: Date | null;
    grades: ReadonlyMap<string, ProductAbcGrade | null>;
    metricValues: ReadonlyMap<string, number | null>;
    allowPolicyReplacement?: boolean;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        -- queryraw-tenancy-exempt: organization-scoped advisory lock; reads no tenant data.
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`kiditem.master-product-abc:${input.organizationId}`}, 0::bigint)
        )::text AS "lock"
      `);
      const persistedPolicy = await tx.masterProductAbcPolicy.findUnique({
        where: { organizationId: input.organizationId },
      });
      const persistedRevision = persistedPolicy?.revision ?? 0;
      if (
        persistedRevision !== input.policy.revision
        || (
          persistedPolicy
          && !input.allowPolicyReplacement
          && !samePolicyConfig(persistedPolicy, input.policy)
        )
      ) {
        return {
          changedProductCount: 0,
          policy: persistedPolicy
            ? toPolicy(persistedPolicy)
            : {
              ...input.policy,
              revision: 0,
              lastCalculatedAt: null,
              sourceCapturedAt: null,
            },
          stale: true,
        };
      }
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
          revision: 1,
          lastCalculatedAt: calculatedAt,
          sourceCapturedAt: input.sourceCapturedAt,
        },
        update: {
          metric: input.policy.metric,
          periodDays: input.policy.periodDays,
          aCumulativeThreshold: input.policy.aCumulativeThreshold,
          bCumulativeThreshold: input.policy.bCumulativeThreshold,
          revision: { increment: 1 },
          lastCalculatedAt: calculatedAt,
          sourceCapturedAt: input.sourceCapturedAt,
        },
      });
      return { changedProductCount: applied.length, policy: toPolicy(policy), stale: false };
    });
  }
}

function samePolicyConfig(
  persisted: {
    metric: string;
    periodDays: number;
    aCumulativeThreshold: number;
    bCumulativeThreshold: number;
  },
  candidate: MasterProductAbcPolicyRecord,
): boolean {
  return persisted.metric === candidate.metric
    && persisted.periodDays === candidate.periodDays
    && persisted.aCumulativeThreshold === candidate.aCumulativeThreshold
    && persisted.bCumulativeThreshold === candidate.bCumulativeThreshold;
}

function toPolicy(row: {
  metric: string; periodDays: number; aCumulativeThreshold: number; bCumulativeThreshold: number;
  revision: number;
  lastCalculatedAt: Date | null; sourceCapturedAt: Date | null;
}): MasterProductAbcPolicyRecord {
  return {
    metric: row.metric as MasterProductAbcPolicyRecord['metric'],
    periodDays: row.periodDays as MasterProductAbcPolicyRecord['periodDays'],
    aCumulativeThreshold: row.aCumulativeThreshold,
    bCumulativeThreshold: row.bCumulativeThreshold,
    revision: row.revision,
    lastCalculatedAt: row.lastCalculatedAt,
    sourceCapturedAt: row.sourceCapturedAt,
  };
}
