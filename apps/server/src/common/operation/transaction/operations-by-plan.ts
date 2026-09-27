import { Prisma } from '@prisma/client';
import { OPERATION_EXPIRED_ERROR_CODE, OPERATION_EXPIRED_ERROR_MESSAGE } from '../domain/operation-fence';

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
 * plan 에서 무엇을 읽을지. `full` 은 plan 전체, 아니면 `payload` 를 빼고(얼린 문서 · 사진이 크다) `payloadKeys` 의 최상위
 * 칸만 `payload` 아래에 다시 싣는다(없으면 빈 객체 — plan 모양은 그대로다).
 */
export type OperationPlanSelection = 'full' | { payloadKeys: readonly string[] };

/**
 * 호출자 클라이언트로 도는 평범한 읽기(`<owner>/transaction/` 규칙). plan이 `planContainsAny` 중 하나를 JSONB로 품은
 * (`plan @> 조건`) 실행을 시작 역순으로 읽는다 — 등록 실행처럼 대상·리스팅·상품 id가 plan 안에 있는 owner가 옛 전용 표
 * 대신 쓰는 질의다(ADR-0025, `check:operation-owner-boundary`). 쓰지 않는다.
 *
 * - 상태는 SQL 에서 비춘다: 임대가 끝난 `executing` 은 시도가 남았으면 `prepared`, 아니면 만료 `failed`. `statuses` 는 비춘 상태로 거른다.
 * - `resultContainsAny` 가 있으면 result 도 그중 하나를 품어야 한다. `excludeSucceededResult` 를 품은 성공 실행은 뺀다.
 * - `latestPer` 가 있으면 그 plan 최상위 칸마다 가장 최근 하나만(`DISTINCT ON`).
 */
export async function readOperationsByPlan(
  client: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    kinds: readonly string[];
    planContainsAny: readonly Record<string, unknown>[];
    statuses?: readonly string[];
    resultContainsAny?: readonly Record<string, unknown>[];
    excludeSucceededResult?: Record<string, unknown>;
    latestPer?: string;
    plan?: OperationPlanSelection;
    now?: Date;
  }>,
): Promise<OperationByPlanRow[]> {
  if (input.kinds.length === 0 || input.planContainsAny.length === 0) return [];
  if (input.resultContainsAny && input.resultContainsAny.length === 0) return [];
  const now = input.now ?? new Date();
  const planConditions = input.planContainsAny.map((condition) => Prisma.sql`o.plan @> ${JSON.stringify(condition)}::jsonb`);
  const resultCondition = input.resultContainsAny
    ? Prisma.sql`AND (${Prisma.join(input.resultContainsAny.map((condition) => Prisma.sql`o.result @> ${JSON.stringify(condition)}::jsonb`), ' OR ')})`
    : Prisma.empty;
  const excluded = input.excludeSucceededResult
    ? Prisma.sql`AND NOT (o.status = 'succeeded' AND COALESCE(o.result @> ${JSON.stringify(input.excludeSucceededResult)}::jsonb, false))`
    : Prisma.empty;
  const selection = input.plan ?? 'full';
  const plan = selection === 'full'
    ? Prisma.sql`o.plan`
    : selection.payloadKeys.length === 0
      ? Prisma.sql`(o.plan - 'payload') || jsonb_build_object('payload', '{}'::jsonb)`
      : Prisma.sql`(o.plan - 'payload') || jsonb_build_object('payload', jsonb_build_object(${Prisma.join(
        selection.payloadKeys.map((key) => Prisma.sql`${key}::text, o.plan -> 'payload' -> ${key}`),
      )}))`;
  const lapsed = Prisma.sql`(o.status = 'executing' AND o.expires_at <= ${now})`;
  const statusFilter = input.statuses
    ? Prisma.sql`WHERE projected.status = ANY(${[...input.statuses]}::text[])`
    : Prisma.empty;
  const distinct = input.latestPer ? Prisma.sql`DISTINCT ON (projected.latest_key)` : Prisma.empty;
  const order = input.latestPer
    ? Prisma.sql`ORDER BY projected.latest_key, projected.started_at DESC, projected.id DESC`
    : Prisma.sql`ORDER BY projected.started_at DESC, projected.id DESC`;
  const latestKey = input.latestPer ? Prisma.sql`o.plan ->> ${input.latestPer}` : Prisma.sql`NULL::text`;
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
  }>>`
    SELECT ${distinct} projected.id, projected.kind, projected.status, projected.plan, projected.result,
      projected.error_code, projected.error_message, projected.started_at, projected.finished_at
    FROM (
      SELECT o.id::text AS id, o.kind, ${plan} AS plan, o.result, o.started_at, ${latestKey} AS latest_key,
        CASE WHEN ${lapsed} THEN (CASE WHEN o.attempts < o.max_attempts THEN 'prepared' ELSE 'failed' END) ELSE o.status END AS status,
        CASE WHEN ${lapsed} THEN ${OPERATION_EXPIRED_ERROR_CODE} ELSE o.error_code END AS error_code,
        CASE WHEN ${lapsed} THEN ${OPERATION_EXPIRED_ERROR_MESSAGE} ELSE o.error_message END AS error_message,
        CASE WHEN ${lapsed} AND o.attempts >= o.max_attempts THEN o.expires_at ELSE o.finished_at END AS finished_at
      FROM operations o
      WHERE o.organization_id = ${input.organizationId}::uuid
        AND o.kind = ANY(${[...input.kinds]}::text[])
        AND (${Prisma.join(planConditions, ' OR ')})
        ${resultCondition}
        ${excluded}
    ) projected
    ${statusFilter}
    ${order}
  `;
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    plan: row.plan,
    result: row.result,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}
