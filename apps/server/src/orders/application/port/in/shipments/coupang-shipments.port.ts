import type { CoupangShipmentDateItem } from "@kiditem/shared/orders-operations";
import type { OwnerTransaction } from "../../../../../common/owner-transaction";
import type { CoupangShipmentDateSummaryEntry } from "../../../../domain/shipments/shipment-summary";

/** Shipment-date facts `read/coupang-shipment-date-summary.reader.ts` returns. */
export type { CoupangShipmentDateSummaryEntry };

export const COUPANG_SHIPMENTS_PORT = Symbol("CoupangShipmentsPort");

export type CoupangShipmentMergedFileKind = "label" | "statement" | "all";

export type CoupangShipmentMergedFileItem = {
  id: string;
  runId: string;
  date: string;
  kind: CoupangShipmentMergedFileKind;
  fileName: string;
  downloadPath: string;
  sizeBytes: number;
  sourceCount: number;
  pageCount: number;
  centers: string[];
  createdAt: string;
};

export type CoupangShipmentDailyFiles = {
  date: string;
  files: CoupangShipmentMergedFileItem[];
  runCount: number;
  updatedAt: string | null;
};

export type CoupangShipmentFilesResponse = {
  rootPath: string;
  totalFiles: number;
  days: CoupangShipmentDailyFiles[];
};

export type CoupangShipmentFileRequest = {
  runId: string;
  date: string;
  fileName: string;
};

export type CoupangShipmentResolvedFile = {
  path: string;
  fileName: string;
  sizeBytes: number;
};

export type CoupangShipmentDateSummaryResult = {
  items: CoupangShipmentDateSummaryEntry[];
};

export interface CoupangShipmentsPort {
  listLocalFiles(organizationId: string): Promise<CoupangShipmentFilesResponse>;
  resolveLocalFile(
    organizationId: string,
    input: CoupangShipmentFileRequest,
  ): Promise<CoupangShipmentResolvedFile>;
  listDateSummary(
    organizationId: string,
  ): Promise<CoupangShipmentDateSummaryResult>;
  /**
   * 실행 `orders.coupang_shipment_summary`의 finalize가 finish 트랜잭션(`tx`) 안에서 부른다. 검증을 통과한
   * 발송일을 그 실행의 행으로 쓴다(ADR-0025: 원장은 finish 트랜잭션에서만).
   */
  publishSummaryOperation(
    tx: OwnerTransaction,
    input: { organizationId: string; operationId: string; items: readonly CoupangShipmentDateItem[] },
  ): Promise<{ dates: number }>;
}
