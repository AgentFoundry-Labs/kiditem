import { SOURCE_IMPORT_RUN_COMPLETED_STATUS } from '@kiditem/shared/source-import';
import { Prisma } from '@prisma/client';

/**
 * Reads completion provenance from Core's shared import history. This is the
 * last completed import, not proof that a source's current facts cover a period.
 * Each source owner retains its publication and current-generation policy.
 */
export async function readLastCompletedSourceImports(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<ReadonlyMap<string, Date>> {
  const rows = await tx.sourceImportRun.groupBy({
    by: ['sourceType'],
    where: { organizationId, status: SOURCE_IMPORT_RUN_COMPLETED_STATUS, importedAt: { not: null } },
    _max: { importedAt: true },
  });
  return new Map(rows.flatMap((row) =>
    row._max.importedAt === null ? [] : [[row.sourceType, row._max.importedAt] as const],
  ));
}

/**
 * 한 창(窓) 안에 **완료된** 옛 수집 run이 실어 온 주문 수를 원천 × 몰로 갈라 준다. 몰마다 **마지막 수집 한 번만**
 * 센다(같은 몰을 두 번 걷으면 '오늘 주문'이 누를 때마다 불어난다 — 사장님 2026-09-21). 아무것도 완료되지 않았으면
 * `null`. 읽는 곳은 Orders의 오늘 주문 capability 하나다 — 실행 계약으로 옮긴 수집과 합쳐 두 화면이 같은 수를
 * 말한다(사장님 2026-09-22).
 */
export async function readCompletedImportRowCountsByScope(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    sourceTypes: readonly string[];
    from: Date;
    to: Date;
  }>,
): Promise<Array<{ sourceType: string; mallKey: string | null; rowCount: number }> | null> {
  if (input.sourceTypes.length === 0) return null;
  const rows = await tx.$queryRaw<Array<{ source_type: string; mall_key: string; row_count: number }>>`
    SELECT DISTINCT ON (source_type, COALESCE(plan->>'mallKey', ''))
           source_type, COALESCE(plan->>'mallKey', '') AS mall_key, row_count
    FROM source_import_runs
    WHERE organization_id = ${input.organizationId}::uuid
      AND status = ${SOURCE_IMPORT_RUN_COMPLETED_STATUS}
      AND source_type IN (${Prisma.join([...input.sourceTypes])})
      AND created_at >= ${input.from}
      AND created_at < ${input.to}
    ORDER BY source_type, COALESCE(plan->>'mallKey', ''), created_at DESC
  `;
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    sourceType: row.source_type,
    mallKey: row.mall_key === '' ? null : row.mall_key,
    rowCount: Number(row.row_count ?? 0),
  }));
}
