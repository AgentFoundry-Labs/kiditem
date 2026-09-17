import type { Prisma } from '@prisma/client';

/**
 * `MallOperationOutcome` 원장의 등록 리더(ADR-0009).
 *
 * 관찰 기록은 웹이 몰 작업(로그인 확인 · 로그인 테스트 · 등록 폼 채움)을 마친 자리에서 한 줄씩
 * 쓰는 append-only 로그다. 원장 밖에서는 이 파일로만 읽는다. 쓰기와 같은 키 재읽기는 Channels
 * 저장소 어댑터가 owner publication 으로 가진다.
 */

export type MallOperationOutcomeFact = Readonly<{
  id: string;
  mallKey: string;
  operation: string;
  outcome: string;
  reasonCode: string | null;
  message: string | null;
  itemCount: number | null;
  failedCount: number | null;
  warningCount: number | null;
  occurredAt: Date;
}>;

export type MallOperationOutcomeCountFact = Readonly<{
  mallKey: string;
  operation: string;
  outcome: string;
  count: number;
}>;

export type MallOperationOutcomeSummaryFacts = Readonly<{
  /** 기간 안의 (몰, 작업, 결과)별 건수. */
  counts: readonly MallOperationOutcomeCountFact[];
  /** 기간 안에서 (몰, 작업)마다 가장 최근 한 줄. */
  latest: readonly MallOperationOutcomeFact[];
}>;

export const MALL_OPERATION_OUTCOME_FACT_SELECT = {
  id: true,
  mallKey: true,
  operation: true,
  outcome: true,
  reasonCode: true,
  message: true,
  itemCount: true,
  failedCount: true,
  warningCount: true,
  occurredAt: true,
} satisfies Prisma.MallOperationOutcomeSelect;

export async function readMallOperationOutcomeSummaryFacts(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; since: Date },
): Promise<MallOperationOutcomeSummaryFacts> {
  const where = { organizationId: input.organizationId, occurredAt: { gte: input.since } };
  const [grouped, latest] = await Promise.all([
    tx.mallOperationOutcome.groupBy({
      by: ['mallKey', 'operation', 'outcome'],
      where,
      _count: { _all: true },
    }),
    tx.mallOperationOutcome.findMany({
      where,
      orderBy: [{ mallKey: 'asc' }, { operation: 'asc' }, { occurredAt: 'desc' }, { id: 'desc' }],
      distinct: ['mallKey', 'operation'],
      select: MALL_OPERATION_OUTCOME_FACT_SELECT,
    }),
  ]);
  return {
    counts: grouped.map((row) => ({
      mallKey: row.mallKey,
      operation: row.operation,
      outcome: row.outcome,
      count: row._count._all,
    })),
    latest,
  };
}
