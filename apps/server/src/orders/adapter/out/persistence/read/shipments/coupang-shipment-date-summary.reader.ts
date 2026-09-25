import type { Prisma } from "@prisma/client";
import type { CoupangShipmentDateSummaryEntry } from "../../../../../domain/shipments/shipment-summary";

type Tx = Prisma.TransactionClient;

/**
 * 발송일 달력(KID-359): 발송일마다 가장 최근에 성공한 `orders.coupang_shipment_summary` 실행의 값, 그 실행 값이
 * 없으면 기준(baseline) 행을 미검증 칸으로. 실행 행은 finish 트랜잭션에서만 생기므로 성공한 실행의 것뿐이고,
 * 실행은 조직 잠금(`org`)으로 한 번에 하나라 `captured_at` 순서가 실행 순서다. 옛 attempt run 행(`source_import_run_id`)은
 * 읽지 않는다(ADR-0025: 옛 행은 옮기지 않는다).
 */
export async function readShipmentDateCalendar(
  tx: Tx,
  organizationId: string,
): Promise<CoupangShipmentDateSummaryEntry[]> {
  const rows = await tx.$queryRaw<
    Array<{ shipment_date: string; count: number; boxes: number; captured_at: Date; operation_id: string | null }>
  >`
    SELECT DISTINCT ON (d.shipment_date) d.shipment_date, d.count, d.boxes, d.captured_at, d.operation_id
    FROM coupang_shipment_date_summaries d
    WHERE d.organization_id = ${organizationId}::uuid
      AND (d.operation_id IS NOT NULL OR d.source_import_run_id IS NULL)
    ORDER BY d.shipment_date DESC, (d.operation_id IS NULL), d.captured_at DESC
  `;
  return rows.map((row) => ({
    date: row.shipment_date,
    count: row.operation_id === null ? null : row.count,
    boxes: row.operation_id === null ? null : row.boxes,
    capturedAt: row.captured_at.toISOString(),
    verified: row.operation_id !== null,
  }));
}
