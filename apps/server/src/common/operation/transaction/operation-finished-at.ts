import type { Prisma } from '@prisma/client';

/**
 * 호출자 트랜잭션 안에서 도는 평범한 함수(`<owner>/transaction/` 규칙, KID-365). 원장 행이 들고 있는 실행 id들 가운데
 * 성공한 실행이 가장 늦게 끝난 시각을 읽는다 — 주문 사실 리더가 "이 사실을 언제 관측했나"를 그 사실을 쓴 실행의 끝난
 * 시각으로 말할 때 쓴다. 실행 표를 읽는 코드는 이 모듈(common/operation)에만 둔다(ADR-0025, `check:operation-owner-boundary`).
 */
export async function readLatestSucceededFinishedAt(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; ids: readonly string[] }>,
): Promise<Date | null> {
  if (input.ids.length === 0) return null;
  const latest = await tx.operation.aggregate({
    where: { organizationId: input.organizationId, id: { in: [...input.ids] }, status: 'succeeded' },
    _max: { finishedAt: true },
  });
  return latest._max.finishedAt;
}
