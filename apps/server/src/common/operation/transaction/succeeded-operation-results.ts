import type { Prisma } from '@prisma/client';

/** 성공한 실행 하나의 result와 끝난 시각(owner가 result를 자기 Zod로 읽는다). */
export interface SucceededOperationResult {
  id: string;
  kind: string;
  result: Prisma.JsonValue | null;
  finishedAt: Date;
}

/**
 * 호출자 클라이언트(트랜잭션이든 아니든)로 도는 평범한 읽기(`<owner>/transaction/` 규칙). 주어진 kind들 가운데 `since`
 * 이후에 성공으로 끝난 실행의 result를 끝난 순서로 읽는다 — 셀피아 자동송장 대상처럼 표 없이 실행 result만으로 정하는
 * owner 규칙이 쓴다(KID-355 wave8b). `reconciling`·실패·취소는 성공이 아니라 없다. 실행 표를 읽는 코드는 이 모듈
 * (common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readSucceededOperationResults(
  client: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kinds: readonly string[]; since: Date }>,
): Promise<SucceededOperationResult[]> {
  if (input.kinds.length === 0) return [];
  const rows = await client.operation.findMany({
    where: {
      organizationId: input.organizationId,
      kind: { in: [...input.kinds] },
      status: 'succeeded',
      finishedAt: { not: null, gte: input.since },
    },
    orderBy: [{ finishedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, kind: true, result: true, finishedAt: true },
  });
  return rows.flatMap((row) => (row.finishedAt ? [{ id: row.id, kind: row.kind, result: row.result, finishedAt: row.finishedAt }] : []));
}
