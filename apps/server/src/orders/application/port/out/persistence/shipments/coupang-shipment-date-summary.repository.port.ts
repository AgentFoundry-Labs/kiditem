import type { CoupangShipmentDateItem } from "@kiditem/shared/orders-operations";
import type { OwnerTransaction } from "../../../../../../common/owner-transaction";
import type { CoupangShipmentDateSummaryEntry } from "../../../in/shipments/index";

export const COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT = Symbol(
  "COUPANG_SHIPMENT_DATE_SUMMARY_REPOSITORY_PORT",
);

export type CoupangShipmentDateSummaryRecord = CoupangShipmentDateSummaryEntry;

export interface CoupangShipmentDateSummaryRepositoryPort {
  /** 발송일마다 가장 최근에 성공한 실행의 값, 없으면 기준(미검증) 칸. */
  listDateSummary(organizationId: string): Promise<CoupangShipmentDateSummaryRecord[]>;
  /** finish 트랜잭션 안에서 한 실행의 발송일 행을 쓴다. */
  publishOperation(
    tx: OwnerTransaction,
    input: { organizationId: string; operationId: string; items: readonly CoupangShipmentDateItem[]; capturedAt: Date },
  ): Promise<{ dates: number }>;
}
