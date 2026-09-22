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
 * 한 창(窓) 안에 **완료된** 수집이 실어 온 주문 줄 수. 아무것도 완료되지 않았으면 `null` —
 * 0 은 "걷었는데 없었다" 이고 `null` 은 "아직 안 걷었다" 라서 둘을 합치면 화면이 거짓말을 한다.
 *
 * 몰마다 **마지막 수집 한 번만** 센다. 같은 몰을 두 번 걷으면 같은 주문을 두 번 세게 되고,
 * 그러면 '오늘 주문' 이 누를 때마다 불어난다(사장님 2026-09-21). 몰을 가르는 키는 수집 계획의
 * `mallKey` 이고, 쿠팡직배송처럼 그 칸이 없는 원천은 원천 자체가 한 묶음이다.
 *
 * 대시보드의 '오늘 주문' 이 이 값을 읽는다. 고객이 오늘 주문한 수가 아니라 **오늘 우리가
 * 걷은 수**다.
 */
export async function readCompletedImportRowCount(
  tx: Prisma.TransactionClient,
  input: Readonly<{
    organizationId: string;
    sourceTypes: readonly string[];
    from: Date;
    to: Date;
  }>,
): Promise<number | null> {
  const rows = await readCompletedImportRowCountsByScope(tx, input);
  if (rows === null) return null;
  return rows.reduce((sum, row) => sum + row.rowCount, 0);
}

/**
 * 같은 창 · 같은 규칙을 원천 × 몰로 갈라 준다. 대시보드는 이걸 더해 '오늘 주문' 한 칸을 쓰고,
 * 주문수집 화면은 몰 칸마다 그 몰 줄을 쓴다 — 두 화면이 같은 사실을 읽어야 같은 수를 말한다
 * (사장님 2026-09-22).
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
