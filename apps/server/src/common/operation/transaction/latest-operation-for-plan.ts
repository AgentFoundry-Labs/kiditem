import type { Prisma } from '@prisma/client';
import { OPERATION_EXPIRED_ERROR_CODE, OPERATION_EXPIRED_ERROR_MESSAGE } from '../domain/operation-fence';

/** plan의 최상위 칸 값들로 찾은 실행 한 줄(KID-389). 상태는 `operations-by-plan`과 같은 만료 규칙으로 비춘다. */
export interface PlannedOperationRow {
  id: string;
  kind: string;
  status: string;
  plan: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  expiresAt: Date;
}

/**
 * 호출자 클라이언트로 도는 평범한 읽기(`<owner>/transaction/` 규칙, ADR-0025). kind들 가운데 plan의 최상위 칸이
 * `planEquals`의 값과 모두 같은 실행 중 가장 최근에 시작한 하나를 읽는다 — 서버 구동 소싱 kind가 옛 run 표 대신
 * 원천·대상 키(또는 요청 멱등 키)로 최신 실행을 찾을 때 쓴다(KID-389). 임대가 끝난 `executing`은 시도가 남았으면
 * `prepared`, 아니면 만료 `failed`로 비춘다. 쓰지 않는다.
 */
export async function readLatestOperationForPlan(
  client: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; kinds: readonly string[]; planEquals: Readonly<Record<string, string>>; now?: Date }>,
): Promise<PlannedOperationRow | null> {
  const fields = Object.entries(input.planEquals);
  if (input.kinds.length === 0 || fields.length === 0) return null;
  const row = await client.operation.findFirst({
    where: {
      organizationId: input.organizationId,
      kind: { in: [...input.kinds] },
      AND: fields.map(([key, value]) => ({ plan: { path: [key], equals: value } })),
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, kind: true, status: true, plan: true, result: true, errorCode: true, errorMessage: true,
      startedAt: true, finishedAt: true, expiresAt: true, attempts: true, maxAttempts: true,
    },
  });
  if (!row) return null;
  const now = input.now ?? new Date();
  const lapsed = row.status === 'executing' && row.expiresAt <= now;
  const exhausted = row.attempts >= row.maxAttempts;
  return {
    id: row.id,
    kind: row.kind,
    status: lapsed ? (exhausted ? 'failed' : 'prepared') : row.status,
    plan: row.plan,
    result: row.result,
    errorCode: lapsed ? OPERATION_EXPIRED_ERROR_CODE : row.errorCode,
    errorMessage: lapsed ? OPERATION_EXPIRED_ERROR_MESSAGE : row.errorMessage,
    startedAt: row.startedAt,
    finishedAt: lapsed && exhausted ? row.expiresAt : row.finishedAt,
    expiresAt: row.expiresAt,
  };
}
