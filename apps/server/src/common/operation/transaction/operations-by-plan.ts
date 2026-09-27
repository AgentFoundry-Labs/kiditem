import { Prisma } from '@prisma/client';
import { decideFailure } from '../domain/operation-attempt';
import { isLeaseExpired, OPERATION_EXPIRED_ERROR_CODE, OPERATION_EXPIRED_ERROR_MESSAGE } from '../domain/operation-fence';

/** plan JSON이 조건 하나를 품은 실행 한 줄(KID-364). owner가 plan·result를 자기 Zod로 읽는다. */
export interface OperationByPlanRow {
  id: string;
  kind: string;
  /** 임대가 끝났는데 아직 처분되지 않은 `executing`은 `OperationPort`의 만료 규칙대로 비춘 상태다. */
  status: string;
  plan: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

/**
 * 호출자 클라이언트로 도는 평범한 읽기(`<owner>/transaction/` 규칙). plan이 `planContainsAny` 중 하나를 JSONB로 품은
 * (`plan @> 조건`) 실행을 시작 역순으로 읽는다 — 등록 실행처럼 대상·리스팅·상품 id가 plan 안에 있는 owner가 옛 전용 표
 * 대신 쓰는 질의다(ADR-0025, `check:operation-owner-boundary`). `statuses`는 비춘 상태로 거른다. 쓰지 않는다.
 */
export async function readOperationsByPlan(
  client: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    kinds: readonly string[];
    planContainsAny: readonly Record<string, unknown>[];
    statuses?: readonly string[];
    now?: Date;
  }>,
): Promise<OperationByPlanRow[]> {
  if (input.kinds.length === 0 || input.planContainsAny.length === 0) return [];
  const now = input.now ?? new Date();
  const conditions = input.planContainsAny.map((condition) => Prisma.sql`o.plan @> ${JSON.stringify(condition)}::jsonb`);
  const rows = await client.$queryRaw<Array<{
    id: string;
    kind: string;
    status: string;
    plan: Prisma.JsonValue | null;
    result: Prisma.JsonValue | null;
    error_code: string | null;
    error_message: string | null;
    started_at: Date;
    finished_at: Date | null;
    expires_at: Date;
    attempts: number;
    max_attempts: number;
  }>>`
    SELECT o.id::text AS id, o.kind, o.status, o.plan, o.result, o.error_code, o.error_message,
      o.started_at, o.finished_at, o.expires_at, o.attempts, o.max_attempts
    FROM operations o
    WHERE o.organization_id = ${input.organizationId}::uuid
      AND o.kind = ANY(${[...input.kinds]}::text[])
      AND (${Prisma.join(conditions, ' OR ')})
    ORDER BY o.started_at DESC, o.id DESC
  `;
  const statuses = input.statuses ? new Set(input.statuses) : null;
  return rows.flatMap((row) => {
    let status = row.status;
    let errorCode = row.error_code;
    let errorMessage = row.error_message;
    let finishedAt = row.finished_at;
    if (status === 'executing' && isLeaseExpired(row.expires_at, now)) {
      errorCode = OPERATION_EXPIRED_ERROR_CODE;
      errorMessage = OPERATION_EXPIRED_ERROR_MESSAGE;
      if (decideFailure({ attempts: row.attempts, maxAttempts: row.max_attempts }, 0, now).retry) {
        status = 'prepared';
      } else {
        status = 'failed';
        finishedAt = row.expires_at;
      }
    }
    if (statuses && !statuses.has(status)) return [];
    return [{
      id: row.id,
      kind: row.kind,
      status,
      plan: row.plan,
      result: row.result,
      errorCode,
      errorMessage,
      startedAt: row.started_at,
      finishedAt,
    }];
  });
}
