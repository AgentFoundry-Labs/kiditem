import type { Prisma } from '@prisma/client';

/** 업무일 창이 겹치는 성공 실행 하나(owner가 plan·result를 자기 Zod로 읽는다). */
export interface SucceededOperationWindow {
  id: string;
  kind: string;
  plan: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  windowStart: Date;
  windowEnd: Date;
  startedAt: Date;
  finishedAt: Date | null;
}

/**
 * 호출자 트랜잭션 안에서 도는 평범한 함수(`<owner>/transaction/` 규칙). 호출자 트랜잭션 안에서 업무일 창(`windowStart`~`windowEnd`)이 [firstDate, lastDate]와 겹치는 성공 실행을 읽는다(KID-359).
 * 주문 사실 리더처럼 트랜잭션 함수로만 읽는 owner 리더가 실행이 확인한 기간(몰 적용 범위)을 옛 run과 같은 트랜잭션에서
 * 볼 때 쓴다. 실행 표를 읽는 코드는 이 모듈(common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readSucceededOperationWindows(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kinds: readonly string[]; firstDate: string; lastDate: string }>,
): Promise<SucceededOperationWindow[]> {
  if (input.kinds.length === 0) return [];
  const rows = await tx.operation.findMany({
    where: {
      organizationId: input.organizationId,
      kind: { in: [...input.kinds] },
      status: 'succeeded',
      windowStart: { not: null, lte: new Date(`${input.lastDate}T00:00:00.000Z`) },
      windowEnd: { not: null, gte: new Date(`${input.firstDate}T00:00:00.000Z`) },
    },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, kind: true, plan: true, result: true, windowStart: true, windowEnd: true, startedAt: true, finishedAt: true },
  });
  return rows.flatMap((row) => (row.windowStart && row.windowEnd ? [{ ...row, windowStart: row.windowStart, windowEnd: row.windowEnd }] : []));
}
