import { Prisma } from '@prisma/client';

/** 한 실행이 확정한 창(`window_start`·`window_end`, 달력일 `YYYY-MM-DD`)과 그 실행의 plan 칸 하나(KID-372). */
export interface OperationWindowRow {
  id: string;
  /** `planKey`가 가리키는 plan 최상위 칸의 문자열 값. */
  planValue: string;
  windowStart: string;
  windowEnd: string;
  finishedAt: Date | null;
  /** `extraPlanKey`가 가리키는 plan 최상위 칸의 문자열 값(요청하지 않았거나 없으면 `null`). */
  extraPlanValue?: string | null;
}

/**
 * 호출자 클라이언트로 도는 평범한 읽기(`<owner>/transaction/` 규칙). 한 kind의 끝난 실행 가운데 창을 확정한 것만,
 * plan 최상위 칸 `planKey`가 `planValues` 중 하나인 실행을 읽는다 — 광고 보고서처럼 owner가 "어느 날을 측정했는가"를
 * 옛 수집 표의 coverage 칸 대신 실행 창에서 읽을 때 쓰는 질의다(ADR-0025, `check:operation-owner-boundary`). 쓰지 않는다.
 *
 * - 창은 `finalize`가 좁힌 뒤의 창(`narrowedWindow`)이다. 창이 없는 실행(`window_start`/`window_end` null)은 빠진다.
 * - `statuses` 기본은 `['succeeded']`. 실패·취소 실행은 아무 날도 측정하지 않았다.
 */
export async function readOperationWindows(
  client: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    kind: string;
    planKey: string;
    planValues: readonly string[];
    statuses?: readonly string[];
    /** 함께 돌려받을 plan 최상위 칸 하나(예: 광고 보고서의 요청 끝 `endDate`). */
    extraPlanKey?: string;
  }>,
): Promise<OperationWindowRow[]> {
  if (input.planValues.length === 0) return [];
  const statuses = input.statuses ?? ['succeeded'];
  const rows = await client.$queryRaw<Array<{
    id: string;
    plan_value: string;
    window_start: string;
    window_end: string;
    finished_at: Date | null;
    extra_plan_value: string | null;
  }>>(Prisma.sql`
    SELECT o.id,
      o.plan ->> ${input.planKey} AS plan_value,
      to_char(o.window_start, 'YYYY-MM-DD') AS window_start,
      to_char(o.window_end, 'YYYY-MM-DD') AS window_end,
      o.finished_at,
      ${input.extraPlanKey ? Prisma.sql`o.plan ->> ${input.extraPlanKey}` : Prisma.sql`NULL::text`} AS extra_plan_value
    FROM operations o
    WHERE o.organization_id = ${input.organizationId}::uuid
      AND o.kind = ${input.kind}
      AND o.status = ANY(${[...statuses]}::text[])
      AND o.window_start IS NOT NULL
      AND o.window_end IS NOT NULL
      AND o.plan ->> ${input.planKey} = ANY(${[...input.planValues]}::text[])
    ORDER BY o.finished_at ASC NULLS LAST, o.id ASC
  `);
  return rows.map((row) => ({
    id: row.id,
    planValue: row.plan_value,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    finishedAt: row.finished_at,
    ...(input.extraPlanKey ? { extraPlanValue: row.extra_plan_value } : {}),
  }));
}
